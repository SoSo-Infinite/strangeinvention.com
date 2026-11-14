"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import type { ClientCatalog } from "@/play/catalog";
import { beginVisit, rememberRoom } from "@/play/memory";
import { ItemPanel } from "@/play/ui/ItemPanel";

const Warehouse = dynamic(() => import("@/play/world/Warehouse"), {
  ssr: false,
  loading: () => <p className="loading">Opening the first room…</p>,
});

const ENTRY = [
  "saluting-device",
  "plow-gun",
  "storm-mask",
  "quantum-lighter",
  "plasma-globe",
  "mustache-guard",
];

const DOC_LINE =
  "Doc taps the bench. He is not a doctor. He says a visitor may read the shelf before anything goes home.";
const OOGER_LINE = 'Ooger blinks. "hooo-mans keep touching things."';

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; sprint: boolean };
type Stick = { x: number; y: number; sprint: boolean };

class ViewBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function subscribeNothing() {
  return () => {};
}

type ClientFlags = {
  webgl: boolean;
  low: boolean;
  debug: boolean;
  coarse: boolean;
  cancel: boolean;
};

const SERVER_FLAGS: ClientFlags = {
  webgl: true,
  low: true,
  debug: false,
  coarse: false,
  cancel: false,
};

let cachedFlags = "";
let cachedFlagValue = SERVER_FLAGS;

function readClientFlags(): ClientFlags {
  const params = new URLSearchParams(window.location.search);
  const next: ClientFlags = {
    webgl: hasWebGL(),
    low: wantsLow(),
    debug: params.get("debug") === "1",
    coarse: window.matchMedia("(pointer: coarse)").matches,
    cancel: params.get("checkout") === "cancel",
  };
  const key = JSON.stringify(next);
  if (key === cachedFlags) return cachedFlagValue;
  cachedFlags = key;
  cachedFlagValue = next;
  return cachedFlagValue;
}

function readServerFlags() {
  return SERVER_FLAGS;
}

let visitSeed: number | null = null;

function readVisitSeed() {
  if (visitSeed === null) visitSeed = beginVisit().seed;
  return visitSeed;
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function wantsLow() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("low") === "1") return true;
  if (params.get("low") === "0") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory <= 4) return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function PlayClient({
  catalog,
  checkoutReady,
  affiliateReady,
}: {
  catalog: ClientCatalog;
  checkoutReady: boolean;
  affiliateReady: boolean;
}) {
  const flags = useSyncExternalStore(subscribeNothing, readClientFlags, readServerFlags);
  const seed = useSyncExternalStore(subscribeNothing, readVisitSeed, () => 1);
  const webgl = flags.webgl;
  const low = flags.low;
  const debug = flags.debug;
  const coarse = flags.coarse;
  const [panel, setPanel] = useState<{ itemId: string; roomId: string } | null>(null);
  const [talk, setTalk] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [viewFailed, setViewFailed] = useState(false);
  const cancelNote = flags.cancel ? "The order was not sent. The warehouse is still open." : "";
  const [roomLabel, setRoomLabel] = useState("entry");
  const [stats, setStats] = useState({ fps: 0, loaded: 0 });
  const [hurry, setHurry] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const keysRef = useRef<Keys>({ f: false, b: false, l: false, r: false, sprint: false });
  const stickRef = useRef<Stick>({ x: 0, y: 0, sprint: false });
  const lookRef = useRef({ dx: 0, dy: 0 });
  const pausedRef = useRef(false);
  const pickRef = useRef<(() => { kind?: string; itemId?: string; roomId?: string } | null) | null>(null);
  const drag = useRef({ x: 0, y: 0, moved: 0, id: -1 });

  const items = catalog.items.map((item) => ({ id: item.id, name: item.name, badge: item.badge }));
  const entryItemIds = ENTRY.filter((id) => catalog.items.some((item) => item.id === id));
  const active = panel ? catalog.items.find((item) => item.id === panel.itemId) : null;

  const interact = useCallback(() => {
    const hit = pickRef.current?.();
    if (!hit?.kind) return;
    if (hit.kind === "item" && hit.itemId) {
      setPanel({ itemId: hit.itemId, roomId: hit.roomId || "room" });
      setTalk(null);
      return;
    }
    if (hit.kind === "doc") setTalk(DOC_LINE);
    if (hit.kind === "ooger") setTalk(OOGER_LINE);
  }, []);

  useEffect(() => {
    pausedRef.current = Boolean(panel || talk || list || !webgl);
  }, [panel, talk, list, webgl]);

  useEffect(() => {
    if (panel && document.pointerLockElement) document.exitPointerLock();
  }, [panel]);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanel(null);
        setTalk(null);
        setList(false);
      }
      if (event.key === "e" || event.key === "E") interact();
      if (event.key === "Shift") keysRef.current.sprint = true;
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") keysRef.current.f = true;
      if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") keysRef.current.b = true;
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") keysRef.current.l = true;
      if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") keysRef.current.r = true;
    }
    function up(event: KeyboardEvent) {
      if (event.key === "Shift") keysRef.current.sprint = false;
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") keysRef.current.f = false;
      if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") keysRef.current.b = false;
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") keysRef.current.l = false;
      if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") keysRef.current.r = false;
    }
    function move(event: MouseEvent) {
      if (!document.pointerLockElement) return;
      lookRef.current.dx += event.movementX;
      lookRef.current.dy += event.movementY;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
    };
  }, [interact]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, .stick")) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current.id || document.pointerLockElement) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    lookRef.current.dx += dx;
    lookRef.current.dy += dy;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current.id) return;
    const tapped = drag.current.moved < 10;
    drag.current.id = -1;
    if (!tapped) return;
    if (!coarse && !document.pointerLockElement) {
      document.body.requestPointerLock?.();
      return;
    }
    interact();
  }

  function moveStick(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const mag = Math.hypot(dx, dy) || 1;
    const nx = dx / mag;
    const ny = dy / mag;
    const clamped = Math.min(1, mag);
    stickRef.current.x = nx * clamped;
    stickRef.current.y = -ny * clamped;
    setKnob({ x: nx * clamped * 36, y: ny * clamped * 36 });
  }

  function endStick() {
    stickRef.current.x = 0;
    stickRef.current.y = 0;
    setKnob({ x: 0, y: 0 });
  }

  return (
    <div className={webgl && !viewFailed ? "stage" : "catalog"}>
      {webgl && !viewFailed ? (
        <>
          <ViewBoundary onFail={() => setViewFailed(true)}>
          <Warehouse
            items={items}
            entryItemIds={entryItemIds}
            seed={seed}
            low={low}
            pausedRef={pausedRef}
            keysRef={keysRef}
            stickRef={stickRef}
            lookRef={lookRef}
            pickRef={pickRef}
            onRoom={(index, id) => {
              setRoomLabel(`${id} · ${index}`);
              rememberRoom(id);
            }}
            onStats={(fps, loaded) => setStats({ fps, loaded })}
          />
          </ViewBoundary>
          <div
            className="overlay"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <div className="crosshair" />
          <p className="hint">
            {coarse
              ? "The stick moves a visitor. A drag looks. A tap opens a glowing shelf piece."
              : "Keys move a visitor. Shift hurries. A click looks. E or a tap opens a glowing shelf piece. Esc closes the card."}
          </p>
          {debug ? (
            <p className="debug">
              {stats.fps} fps · room {roomLabel} · loaded {stats.loaded} · seed {seed}
            </p>
          ) : null}
          {coarse ? (
            <>
              <div
                className="stick"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  moveStick(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) moveStick(event);
                }}
                onPointerUp={endStick}
                onPointerCancel={endStick}
              >
                <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
              </div>
              <button
                type="button"
                className={hurry ? "hurry on" : "hurry"}
                onClick={() => {
                  const next = !hurry;
                  setHurry(next);
                  stickRef.current.sprint = next;
                }}
              >
                Hurry
              </button>
            </>
          ) : null}
          <button type="button" className="list-toggle" onClick={() => setList((open) => !open)}>
            Shelf list
          </button>
          {cancelNote ? <p className="talk">{cancelNote}</p> : null}
          {talk ? (
            <div className="talk">
              <p>{talk}</p>
              <button type="button" className="ghost" onClick={() => setTalk(null)}>
                Close
              </button>
            </div>
          ) : null}
          {list ? (
            <div className="scroll-list">
              <ShelfButtons
                catalog={catalog}
                onOpen={(itemId) => {
                  setPanel({ itemId, roomId: "shelf" });
                  setList(false);
                }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p>This browser cannot open the walking view. The shelf list still works.</p>
          <ShelfButtons catalog={catalog} onOpen={(itemId) => setPanel({ itemId, roomId: "shelf" })} />
        </>
      )}
      {active && panel ? (
        <ItemPanel
          item={active}
          tiers={catalog.tiers}
          roomId={panel.roomId}
          checkoutReady={checkoutReady}
          affiliateReady={affiliateReady}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

function ShelfButtons({
  catalog,
  onOpen,
}: {
  catalog: ClientCatalog;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="catalog">
      {catalog.items.map((item) => (
        <button key={item.id} type="button" className="row" onClick={() => onOpen(item.id)}>
          <span>{item.name}</span>
          <span className={`badge badge-${item.badge.toLowerCase()}`}>{item.badge}</span>
        </button>
      ))}
    </div>
  );
}
