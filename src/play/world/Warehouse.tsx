"use client";

import { AdaptiveDpr, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  generateWarehouse,
  type ExitSide,
  type RoomPlan,
  type ThemeId,
} from "@/play/generate";

export type WorldItem = {
  id: string;
  name: string;
  badge: "REAL" | "FICTIONAL" | "BUYABLE";
};

type Side = "left" | "right" | "forward" | "back";

type Part = {
  position: [number, number, number];
  half: [number, number, number];
  color: string;
};

const THEMES: Record<ThemeId, { fog: string; wall: string; trim: string; floor: string; light: string }> = {
  entry: { fog: "#070b14", wall: "#121a2b", trim: "#3dffb5", floor: "#101827", light: "#eef2fb" },
  steampunk: { fog: "#1a120c", wall: "#3a2a22", trim: "#ffd166", floor: "#241810", light: "#ffd166" },
  atomic: { fog: "#102028", wall: "#1c3a44", trim: "#3dffb5", floor: "#163038", light: "#d5fff2" },
  cyber: { fog: "#070b14", wall: "#161226", trim: "#8b7cff", floor: "#100e1c", light: "#c8bfff" },
};

const BADGE_COLOR = { REAL: "#ffd166", FICTIONAL: "#8b7cff", BUYABLE: "#3dffb5" };

function fullWall(side: Side, color: string): Part {
  if (side === "left") return { position: [-3.9, 2.5, 0], half: [0.12, 2.5, 6], color };
  if (side === "right") return { position: [3.9, 2.5, 0], half: [0.12, 2.5, 6], color };
  if (side === "forward") return { position: [0, 2.5, 5.9], half: [4, 2.5, 0.12], color };
  return { position: [0, 2.5, -5.9], half: [4, 2.5, 0.12], color };
}

function doorParts(side: Side, wall: string, trim: string): Part[] {
  const headerY = 3.9;
  if (side === "forward" || side === "back") {
    const z = side === "forward" ? 5.9 : -5.9;
    return [
      { position: [-2.6, 2.5, z], half: [1.4, 2.5, 0.12], color: wall },
      { position: [2.6, 2.5, z], half: [1.4, 2.5, 0.12], color: wall },
      { position: [0, headerY, z], half: [1.2, 1.1, 0.14], color: trim },
    ];
  }
  const x = side === "left" ? -3.9 : 3.9;
  return [
    { position: [x, 2.5, -3.6], half: [0.12, 2.5, 2.4], color: wall },
    { position: [x, 2.5, 3.6], half: [0.12, 2.5, 2.4], color: wall },
    { position: [x, headerY, 0], half: [0.14, 1.1, 1.2], color: trim },
  ];
}

function isOpen(side: Side, exit: ExitSide, sealBack: boolean, sealExit: boolean) {
  if (side === "back") return !sealBack;
  if (sealExit) return false;
  if (side === "forward") return exit === "forward";
  if (side === "left") return exit === "left";
  return exit === "right";
}

function roomParts(room: RoomPlan, sealBack: boolean, sealExit: boolean) {
  const theme = THEMES[room.theme];
  const parts: Part[] = [{ position: [0, -0.1, 0], half: [4, 0.1, 6], color: theme.floor }];
  const sides: Side[] = ["left", "right", "forward", "back"];
  for (const side of sides) {
    if (isOpen(side, room.exit, sealBack, sealExit)) {
      parts.push(...doorParts(side, theme.wall, theme.trim));
    } else {
      parts.push(fullWall(side, theme.wall));
    }
  }
  return parts;
}

function RoomView({
  room,
  items,
  sealBack,
  sealExit,
}: {
  room: RoomPlan;
  items: WorldItem[];
  sealBack: boolean;
  sealExit: boolean;
}) {
  const parts = roomParts(room, sealBack, sealExit);
  const theme = THEMES[room.theme];
  const slots = [
    [-2.7, 1.05, -3],
    [2.7, 1.05, -1],
    [-2.7, 1.05, 1.2],
    [2.7, 1.05, 3],
  ] as const;
  return (
    <group>
      <RigidBody
        type="fixed"
        colliders={false}
        position={[room.position.x, 0, room.position.z]}
        rotation={[0, room.yaw, 0]}
      >
        {parts.map((part, index) => (
          <CuboidCollider key={`c${index}`} args={part.half} position={part.position} />
        ))}
      </RigidBody>
      <group position={[room.position.x, 0, room.position.z]} rotation={[0, room.yaw, 0]}>
        {parts.map((part, index) => (
          <mesh key={`m${index}`} position={part.position} castShadow={false} receiveShadow>
            <boxGeometry args={[part.half[0] * 2, part.half[1] * 2, part.half[2] * 2]} />
            <meshStandardMaterial color={part.color} roughness={0.86} metalness={0.04} />
          </mesh>
        ))}
        <mesh position={[0, 4.75, 0]}>
          <boxGeometry args={[0.18, 0.12, 11]} />
          <meshStandardMaterial color={theme.trim} />
        </mesh>
        <Sign text={room.piece === "entry" ? "Entry Hall" : room.theme} position={[0, 3.3, -5.5]} color={theme.trim} />
        {room.itemIds.map((id, index) => {
          const item = items.find((entry) => entry.id === id);
          const slot = slots[index % slots.length];
          if (!item || !slot) return null;
          return (
            <mesh
              key={`${id}-${index}`}
              position={slot}
              userData={{ kind: "item", itemId: item.id, roomId: room.id }}
            >
              <boxGeometry args={[0.42, 0.42, 0.42]} />
              <meshStandardMaterial
                color={BADGE_COLOR[item.badge]}
                emissive={BADGE_COLOR[item.badge]}
                emissiveIntensity={0.55}
                roughness={0.4}
              />
            </mesh>
          );
        })}
        {room.landmark === "rube" ? <Rube roomId={room.id} /> : null}
        {room.landmark === "doc" ? <Doc roomId={room.id} /> : null}
        {room.landmark === "ooger" ? <Ooger roomId={room.id} /> : null}
      </group>
    </group>
  );
}

function Sign({
  text,
  position,
  color,
}: {
  text: string;
  position: [number, number, number];
  color: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#121a2b";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = "#eef2fb";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 22), 256, 64);
    const map = new THREE.CanvasTexture(canvas);
    map.needsUpdate = true;
    return map;
  }, [text, color]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <mesh position={position}>
      <planeGeometry args={[1.8, 0.45]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function Rube({ roomId }: { roomId: string }) {
  const group = useRef<THREE.Group>(null);
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useFrame(({ clock }) => {
    if (reduce.current || !group.current) return;
    const time = clock.elapsedTime;
    group.current.children.forEach((child, index) => {
      if (child.name === "domino") {
        const phase = (time * 0.7 - index * 0.18) % 2;
        child.rotation.x = phase < 1 ? Math.min(phase * 1.3, 1.15) : 0;
      }
      if (child.name === "gear") child.rotation.z = time;
      if (child.name === "bell") child.position.y = 1.7 + Math.sin(time * 3) * 0.06;
    });
  });
  return (
    <group ref={group} position={[-2.2, 0, 2]} userData={{ kind: "rube", roomId }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} name="domino" position={[0, 0.35, -0.8 + index * 0.28]}>
          <boxGeometry args={[0.08, 0.5, 0.16]} />
          <meshStandardMaterial color="#eef2fb" />
        </mesh>
      ))}
      <mesh name="gear" position={[0.5, 0.7, 0.8]}>
        <cylinderGeometry args={[0.28, 0.28, 0.08, 10]} />
        <meshStandardMaterial color="#ffd166" />
      </mesh>
      <mesh position={[0.5, 0.45, 1.15]}>
        <boxGeometry args={[0.7, 0.12, 0.28]} />
        <meshStandardMaterial color="#8b7cff" />
      </mesh>
      <mesh name="bell" position={[0.9, 1.7, 1.3]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Doc({ roomId }: { roomId: string }) {
  const data = { kind: "doc", roomId };
  return (
    <group position={[2.15, 0, 1.4]} userData={data}>
      <mesh position={[0, 0.9, 0]} userData={data}>
        <boxGeometry args={[0.34, 1.35, 0.22]} />
        <meshStandardMaterial color="#1a6b66" />
      </mesh>
      <mesh position={[0, 0.7, 0.12]} userData={data}>
        <boxGeometry args={[0.36, 0.08, 0.04]} />
        <meshStandardMaterial color="#3dffb5" emissive="#3dffb5" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.72, 0]} userData={data}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color="#f3e2cf" />
      </mesh>
      <mesh position={[0, 1.9, 0]} userData={data}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshStandardMaterial color="#f7f7fb" />
      </mesh>
      <mesh position={[0, 0.55, 0.08]} userData={data}>
        <boxGeometry args={[0.38, 0.08, 0.08]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
    </group>
  );
}

function Ooger({ roomId }: { roomId: string }) {
  const data = { kind: "ooger", roomId };
  return (
    <group position={[-2.1, 0, -1.2]} userData={data}>
      <mesh position={[0, 0.48, 0]} userData={data}>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshStandardMaterial color="#9aa896" />
      </mesh>
      <mesh position={[0, 0.86, 0]} userData={data}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#b7c4b4" />
      </mesh>
      <mesh position={[-0.07, 0.9, 0.12]} userData={data}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#eef2fb" />
      </mesh>
      <mesh position={[0.07, 0.9, 0.12]} userData={data}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#eef2fb" />
      </mesh>
      <mesh position={[0.05, 0.78, 0.16]} userData={data}>
        <boxGeometry args={[0.03, 0.05, 0.03]} />
        <meshStandardMaterial color="#f4f0e6" />
      </mesh>
      <mesh position={[0.2, 0.5, 0.05]} userData={data}>
        <boxGeometry args={[0.1, 0.06, 0.06]} />
        <meshStandardMaterial color="#e7d7c1" />
      </mesh>
      <mesh position={[-0.16, 0.32, 0.12]} userData={data}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#3dffb5" emissive="#3dffb5" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function ThemeRig({ theme, low }: { theme: ThemeId; low: boolean }) {
  const colors = THEMES[theme];
  return (
    <>
      <color attach="background" args={[colors.fog]} />
      <fogExp2 attach="fog" args={[colors.fog, low ? 0.12 : 0.072]} />
      <hemisphereLight args={[colors.light, "#121a2b", 0.65]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 8, 2]} intensity={0.85} color={colors.light} />
    </>
  );
}

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; sprint: boolean };
type Stick = { x: number; y: number; sprint: boolean };
type Look = { dx: number; dy: number };

function Player({
  rooms,
  pausedRef,
  keysRef,
  stickRef,
  lookRef,
  onRoom,
}: {
  rooms: RoomPlan[];
  pausedRef: React.MutableRefObject<boolean>;
  keysRef: React.MutableRefObject<Keys>;
  stickRef: React.MutableRefObject<Stick>;
  lookRef: React.MutableRefObject<Look>;
  onRoom: (index: number, id: string) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const roomsRef = useRef(rooms);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { world } = useRapier();
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  const velY = useRef(0);
  const lastRoom = useRef(-1);
  const controller = useMemo(() => {
    const next = world.createCharacterController(0.03);
    next.enableAutostep(0.35, 0.2, true);
    next.enableSnapToGround(0.4);
    next.setApplyImpulsesToDynamicBodies(false);
    next.setSlideEnabled(true);
    return next;
  }, [world]);

  useFrame((_, delta) => {
    roomsRef.current = rooms;
    const rb = body.current;
    if (!rb || rb.numColliders() < 1) return;
    const step = Math.min(delta, 0.05);
    yaw.current -= lookRef.current.dx * 0.0026;
    pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current - lookRef.current.dy * 0.0022));
    lookRef.current.dx = 0;
    lookRef.current.dy = 0;

    const keys = keysRef.current;
    const stick = stickRef.current;
    const paused = pausedRef.current;
    const forward = paused ? 0 : (keys.f ? 1 : 0) - (keys.b ? 1 : 0) + (paused ? 0 : stick.y);
    const strafe = paused ? 0 : (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + (paused ? 0 : stick.x);
    const input = Math.min(1, Math.hypot(forward, strafe));
    const speed = keys.sprint || stick.sprint ? 5.6 : 3.3;
    const lookX = -Math.sin(yaw.current);
    const lookZ = -Math.cos(yaw.current);
    const rightX = Math.cos(yaw.current);
    const rightZ = -Math.sin(yaw.current);
    let mx = lookX * forward + rightX * strafe;
    let mz = lookZ * forward + rightZ * strafe;
    const planar = Math.hypot(mx, mz) || 1;
    mx = (mx / planar) * speed * step * input;
    mz = (mz / planar) * speed * step * input;

    const groundedHint = velY.current <= 0;
    velY.current = groundedHint ? Math.min(velY.current, 0) - 0.2 : velY.current - 16 * step;
    const collider = rb.collider(0);
    controller.computeColliderMovement(collider, { x: mx, y: velY.current * step, z: mz });
    const move = controller.computedMovement();
    if (controller.computedGrounded() && velY.current < 0) velY.current = -0.4;
    const pos = rb.translation();
    const next = { x: pos.x + move.x, y: Math.max(0.75, pos.y + move.y), z: pos.z + move.z };
    rb.setNextKinematicTranslation(next);
    const camera = cameraRef.current;
    if (camera) {
      camera.position.set(next.x, next.y + 0.7, next.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    }

    let best: RoomPlan | null = null;
    let bestD = Infinity;
    for (const room of roomsRef.current) {
      if (
        Math.abs(next.x - room.position.x) <= room.half.x &&
        Math.abs(next.z - room.position.z) <= room.half.z
      ) {
        const distance = (next.x - room.position.x) ** 2 + (next.z - room.position.z) ** 2;
        if (!best || distance < bestD - 0.05 || (Math.abs(distance - bestD) <= 0.05 && room.index > best.index)) {
          best = room;
          bestD = distance;
        }
      }
    }
    if (best && best.index !== lastRoom.current) {
      lastRoom.current = best.index;
      onRoom(best.index, best.id);
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={72} near={0.08} far={70} position={[0, 1.5, -2]} />
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[0, 0.75, -2]}
        lockRotations
        gravityScale={0}
      >
        <CapsuleCollider args={[0.45, 0.3]} />
      </RigidBody>
    </>
  );
}

function Picker({
  pickRef,
}: {
  pickRef: React.MutableRefObject<(() => { kind?: string; itemId?: string; roomId?: string } | null) | null>;
}) {
  const { camera, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  useEffect(() => {
    pickRef.current = () => {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObjects(scene.children, true);
      for (const hit of hits) {
        if (hit.distance > 4.5) break;
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (typeof node.userData.kind === "string") {
            return node.userData as { kind?: string; itemId?: string; roomId?: string };
          }
          node = node.parent;
        }
      }
      return null;
    };
  }, [camera, pickRef, ray, scene]);
  return null;
}

export default function Warehouse({
  items,
  entryItemIds,
  seed,
  low,
  pausedRef,
  keysRef,
  stickRef,
  lookRef,
  pickRef,
  onRoom,
  onStats,
}: {
  items: WorldItem[];
  entryItemIds: string[];
  seed: number;
  low: boolean;
  pausedRef: React.MutableRefObject<boolean>;
  keysRef: React.MutableRefObject<Keys>;
  stickRef: React.MutableRefObject<Stick>;
  lookRef: React.MutableRefObject<Look>;
  pickRef: React.MutableRefObject<(() => { kind?: string; itemId?: string; roomId?: string } | null) | null>;
  onRoom: (index: number, id: string) => void;
  onStats: (fps: number, loaded: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const count = Math.max(16, current + 4);
  const itemKey = items.map((item) => item.id).join("|");
  const entryKey = entryItemIds.join("|");
  const rooms = useMemo(
    () =>
      generateWarehouse({
        seed,
        count,
        entryItemIds: entryKey ? entryKey.split("|") : [],
        itemIds: itemKey ? itemKey.split("|") : [],
      }),
    [seed, count, entryKey, itemKey],
  );
  const loaded = rooms.filter((room) => room.index === current || room.index === current + 1);
  const theme = rooms.find((room) => room.index === current)?.theme ?? "entry";
  const fps = useRef({ frames: 0, last: 0 });

  return (
    <Canvas
      camera={{ fov: 72, near: 0.08, far: 70, position: [0, 1.5, -2] }}
      dpr={low ? 1 : [1, 1.5]}
      gl={{ antialias: !low, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(THEMES.entry.fog);
      }}
    >
      <AdaptiveDpr />
      <ThemeRig theme={theme} low={low} />
      <Fps
        onFrame={(now) => {
          if (fps.current.last === 0) {
            fps.current.last = now;
            return;
          }
          fps.current.frames += 1;
          if (now - fps.current.last > 500) {
            const value = Math.round((fps.current.frames * 1000) / (now - fps.current.last));
            fps.current.frames = 0;
            fps.current.last = now;
            onStats(value, loaded.length);
          }
        }}
      />
      <Suspense fallback={null}>
      <Physics gravity={[0, -9.81, 0]}>
        {loaded.map((room) => (
          <RoomView
            key={room.id}
            room={room}
            items={items}
            sealBack={room.index === current && room.index > 0}
            sealExit={room.index > current}
          />
        ))}
        <Player
          rooms={rooms}
          pausedRef={pausedRef}
          keysRef={keysRef}
          stickRef={stickRef}
          lookRef={lookRef}
          onRoom={(index, id) => {
            setCurrent(index);
            onRoom(index, id);
          }}
        />
        <Picker pickRef={pickRef} />
      </Physics>
      </Suspense>
    </Canvas>
  );
}

function Fps({ onFrame }: { onFrame: (now: number) => void }) {
  useFrame(({ clock }) => onFrame(clock.elapsedTime * 1000));
  return null;
}
