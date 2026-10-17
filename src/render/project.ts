/** Single place that maps sim state (x, depth) to screen. Render-only; the sim stays 1D on x. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
/** Sim x range (0..1000) is stretched to the canvas width. */
export const X_SCALE = CANVAS_W / 1000;
/** Ground band: depth 0 is the nearest row (bottom), depth 1 the farthest (top). */
export const BAND_NEAR_Y = 640;
export const BAND_FAR_Y = 510;
export const SCALE_NEAR = 1;
export const SCALE_FAR = 0.85;
export const MAX_JITTER_X = 6;

/** Render-only clearance so units do not stand inside the 160px wall sprite (the sim wall has no thickness). */
export const WALL_CLEAR_PX = 70;
export function wallClearance(x: number, wallX: number): number {
  return Math.max(-1, Math.min(1, (x - wallX) / 25)) * WALL_CLEAR_PX;
}

/** Stable 0..1 depth from an entity id (drawing only). */
export function depthOf(id: number): number {
  const h = Math.imul(id + 1, 2654435761) >>> 0;
  return (h % 1000) / 999;
}

export function project(depth: number, x: number): { x: number; y: number; scale: number; z: number } {
  const d = Math.min(1, Math.max(0, depth));
  return {
    x: x * X_SCALE,
    y: BAND_NEAR_Y + (BAND_FAR_Y - BAND_NEAR_Y) * d,
    scale: SCALE_NEAR + (SCALE_FAR - SCALE_NEAR) * d,
    z: 1 - d, // nearer draws on top
  };
}

/** Sprite pose for an entity; falls back to idle when a pose has no art. */
export function poseOf(
  e: { dead: boolean; windupLeft: number; hitFlash: number; def: { speed: number }; id?: number; x?: number; prevX?: number },
  time = 0,
): string {
  if (e.dead) return 'death';
  if (e.windupLeft >= 0) return 'attack';
  if (e.x !== undefined && e.prevX !== undefined && e.x !== e.prevX)
    return Math.floor(time / 0.18 + (e.id ?? 0)) % 2 === 0 ? 'walkA' : 'walkB'; // 2-frame cycle while moving
  if (e.def.speed > 0) return 'walk';
  return 'idle';
}

/** Strike frame length around a Ram hit, and how long the wall flash/shake lasts after it (seconds, render-only). */
export const RAM_STRIKE_PRE = 0.12;
export const RAM_STRIKE_POST = 0.15;

/**
 * Ram swing frame from its sim attack timers (no wall-clock): idle is the wind-up, the flipped attack frame is the strike.
 * The hit lands when windupLeft reaches 0, then cooldown restarts at attackInterval. `since` is seconds since the hit
 * (0..RAM_STRIKE_POST) while the strike is fresh, else -1; the wall flash and shake key off it.
 */
export function frameForRamAttack(
  windupLeft: number,
  cooldown: number,
  attackInterval: number,
): { frame: 'idle' | 'attack'; since: number } {
  const since = windupLeft < 0 ? attackInterval - cooldown : -1;
  const fresh = since >= 0 && since < RAM_STRIKE_POST;
  if (fresh) return { frame: 'attack', since };
  if (windupLeft >= 0 && windupLeft <= RAM_STRIKE_PRE) return { frame: 'attack', since: -1 };
  return { frame: 'idle', since: -1 };
}
