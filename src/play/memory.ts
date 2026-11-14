const KEY = "si-play-memory";

export type PlayMemory = {
  seed: number;
  roomsSeen: string[];
};

function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}

export function beginVisit(): { seed: number } {
  try {
    const raw = localStorage.getItem(KEY);
    const prev = raw ? (JSON.parse(raw) as Partial<PlayMemory>) : null;
    const seen = Array.isArray(prev?.roomsSeen) ? prev.roomsSeen.filter((id) => typeof id === "string") : [];
    const walked = seen.some((id) => id !== "entry");
    const seed = !prev || walked ? randomSeed() : typeof prev.seed === "number" ? prev.seed >>> 0 : randomSeed();
    const memory: PlayMemory = { seed, roomsSeen: ["entry"] };
    localStorage.setItem(KEY, JSON.stringify(memory));
    return { seed };
  } catch {
    return { seed: 1 };
  }
}

export function rememberRoom(roomId: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const prev = raw ? (JSON.parse(raw) as Partial<PlayMemory>) : {};
    const seen = new Set(
      Array.isArray(prev.roomsSeen) ? prev.roomsSeen.filter((id) => typeof id === "string") : [],
    );
    seen.add(roomId);
    const memory: PlayMemory = {
      seed: typeof prev.seed === "number" ? prev.seed >>> 0 : 1,
      roomsSeen: [...seen],
    };
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private browsing can block storage */
  }
}
