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
export function poseOf(e: { dead: boolean; windupLeft: number; hitFlash: number; def: { speed: number } }): string {
  if (e.dead) return 'death';
  if (e.windupLeft >= 0) return 'attack';
  if (e.def.speed > 0) return 'walk';
  return 'idle';
}
