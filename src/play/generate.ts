import { mulberry32 } from "./prng";

export type ThemeId = "entry" | "steampunk" | "atomic" | "cyber";
export type ExitSide = "forward" | "left" | "right";
export type Landmark = "none" | "rube" | "doc" | "ooger";
export type PieceId =
  | "entry"
  | "straight"
  | "aisle"
  | "corridor"
  | "corner-l"
  | "corner-r"
  | "t-junction"
  | "doorway"
  | "shelf-bay"
  | "double-shelf"
  | "crate-nook"
  | "dead-end"
  | "jog-l"
  | "jog-r"
  | "alcove"
  | "pillar"
  | "service"
  | "loading"
  | "vestibule"
  | "kink"
  | "gallery"
  | "lamp-hall"
  | "pipe-corner";

export type RoomPlan = {
  index: number;
  id: string;
  piece: PieceId;
  theme: ThemeId;
  landmark: Landmark;
  itemIds: string[];
  position: { x: number; z: number };
  yaw: number;
  half: { x: number; z: number };
  exit: ExitSide;
};

const BY_EXIT: Record<ExitSide, PieceId[]> = {
  forward: [
    "straight",
    "aisle",
    "corridor",
    "doorway",
    "shelf-bay",
    "double-shelf",
    "vestibule",
    "lamp-hall",
    "loading",
    "t-junction",
    "crate-nook",
    "alcove",
    "pillar",
  ],
  left: ["corner-l", "jog-l", "pipe-corner", "dead-end", "gallery"],
  right: ["corner-r", "jog-r", "kink", "service"],
};

const LANDMARKS: Landmark[] = ["rube", "doc", "ooger"];

export function rotYaw(yaw: number, x: number, z: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export function normYaw(yaw: number) {
  let value = yaw;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function halfExtents(yaw: number) {
  const s = Math.abs(Math.sin(yaw));
  const c = Math.abs(Math.cos(yaw));
  return { x: 4 * c + 6 * s, z: 4 * s + 6 * c };
}

function exitLocal(exit: ExitSide) {
  if (exit === "left") return { x: -4, z: 0 };
  if (exit === "right") return { x: 4, z: 0 };
  return { x: 0, z: 6 };
}

export function exitWorld(room: RoomPlan) {
  const local = exitLocal(room.exit);
  const offset = rotYaw(room.yaw, local.x, local.z);
  return { x: room.position.x + offset.x, z: room.position.z + offset.z };
}

export function entranceWorld(room: RoomPlan) {
  const offset = rotYaw(room.yaw, 0, -6);
  return { x: room.position.x + offset.x, z: room.position.z + offset.z };
}

function outwardYaw(yaw: number, exit: ExitSide) {
  if (exit === "left") return normYaw(yaw - Math.PI / 2);
  if (exit === "right") return normYaw(yaw + Math.PI / 2);
  return normYaw(yaw);
}

export function overlaps(a: RoomPlan, b: RoomPlan) {
  const dx = Math.abs(a.position.x - b.position.x);
  const dz = Math.abs(a.position.z - b.position.z);
  return dx < a.half.x + b.half.x - 0.05 && dz < a.half.z + b.half.z - 0.05;
}

function landmarkFor(index: number): Landmark {
  if (index === 0 || index % 5 !== 0) return "none";
  return LANDMARKS[(index / 5 - 1) % LANDMARKS.length] ?? "none";
}

function pickPiece(exit: ExitSide, previous: PieceId, rng: () => number) {
  const options = BY_EXIT[exit];
  const start = Math.floor(rng() * options.length);
  for (let i = 0; i < options.length; i += 1) {
    const piece = options[(start + i) % options.length];
    if (piece && piece !== previous) return piece;
  }
  return options[0] ?? "straight";
}

function childPose(previous: RoomPlan, exit: ExitSide): Pick<RoomPlan, "position" | "yaw" | "half"> {
  const yaw = outwardYaw(previous.yaw, exit);
  const door = {
    x: previous.position.x + rotYaw(previous.yaw, exitLocal(exit).x, exitLocal(exit).z).x,
    z: previous.position.z + rotYaw(previous.yaw, exitLocal(exit).x, exitLocal(exit).z).z,
  };
  const back = rotYaw(yaw, 0, -6);
  return {
    yaw,
    position: { x: door.x - back.x, z: door.z - back.z },
    half: halfExtents(yaw),
  };
}

export function generateWarehouse(input: {
  seed: number;
  count: number;
  entryItemIds: string[];
  itemIds: string[];
}): RoomPlan[] {
  const rng = mulberry32(input.seed >>> 0);
  const themes: ThemeId[] = ["steampunk", "atomic", "cyber"];
  let theme: ThemeId = "steampunk";
  let sinceTheme = 0;
  const shown = new Set<ThemeId>();
  const rooms: RoomPlan[] = [
    {
      index: 0,
      id: "entry",
      piece: "entry",
      theme: "entry",
      landmark: "none",
      itemIds: [...input.entryItemIds],
      position: { x: 0, z: 0 },
      yaw: 0,
      half: { x: 4, z: 6 },
      exit: "forward",
    },
  ];

  for (let index = 1; index < input.count; index += 1) {
    const previous = rooms[rooms.length - 1];
    if (!previous) break;
    sinceTheme += 1;
    if (sinceTheme >= 2 + Math.floor(rng() * 2)) {
      theme = themes[Math.floor(rng() * themes.length)] ?? "cyber";
      sinceTheme = 0;
    }
    shown.add(theme);
    if (index >= 9 && shown.size < themes.length) {
      theme = themes.find((item) => !shown.has(item)) ?? theme;
      shown.add(theme);
    }

    const lastFinal = rooms[rooms.length - 2];
    const beforeFinal = rooms[rooms.length - 3];
    const forceTurn = lastFinal?.exit === "forward" && beforeFinal?.exit === "forward";
    const order: ExitSide[] = ["forward", "left", "right"];
    const start = Math.floor(rng() * order.length);
    const exits: ExitSide[] =
      index === 1
        ? ["forward", "left", "right"]
        : [0, 1, 2].map((offset) => order[(start + offset) % 3]).filter((exit): exit is ExitSide => !!exit);
    if (forceTurn) exits.sort((a, b) => (a === "forward" ? 1 : 0) - (b === "forward" ? 1 : 0));

    let placed = false;
    for (const exit of exits) {
      const pose = childPose(previous, exit);
      const piece = previous.piece === "entry" ? pickPiece(exit, "entry", rng) : pickPiece(exit, previous.piece, rng);
      const picks: string[] = [];
      const count = piece.includes("shelf") || piece === "alcove" ? 3 : rng() > 0.45 ? 2 : 1;
      for (let n = 0; n < count; n += 1) {
        const item = input.itemIds[Math.floor(rng() * input.itemIds.length)];
        if (item) picks.push(item);
      }
      const candidate: RoomPlan = {
        index,
        id: `r${index}-${piece}`,
        piece,
        theme,
        landmark: landmarkFor(index),
        itemIds: picks,
        exit: "forward",
        ...pose,
      };
      if (rooms.some((room) => overlaps(room, candidate))) continue;
      previous.exit = exit;
      rooms.push(candidate);
      placed = true;
      break;
    }
    if (!placed) break;
  }

  return rooms;
}
