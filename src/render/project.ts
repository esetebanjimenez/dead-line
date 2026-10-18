/** Single place that maps sim state (x, depth) to screen. Render-only; the sim stays 1D on x. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
/** Sim x range (0..1000) is stretched to the canvas width. */
export const X_SCALE = CANVAS_W / 1000;
/**
 * Ground band: depth 0 is the nearest row (bottom), depth 1 the farthest (top).
 * Cropped so the playable ground fills the lower half of the frame and the sky is a thin strip,
 * instead of the action sitting in a shallow strip under a screenful of scenery.
 */
export const BAND_NEAR_Y = 610;
export const BAND_FAR_Y = 430;
export const SCALE_NEAR = 1.15;
export const SCALE_FAR = 0.82;
export const MAX_JITTER_X = 6;

/**
 * Background crop. The source art is one 1280x720 frame whose grass begins at BG_GRASS_SRC_Y; it is
 * zoomed and shifted so that line lands at BG_GRASS_DST_Y, just above the band. Everything above the
 * grass (trees, hills, sky) is pushed off the top, which is what tightens the camera onto the ground.
 */
export const BG_ZOOM = 1.27;
export const BG_GRASS_SRC_Y = 420;
export const BG_GRASS_DST_Y = 340;

/** Destination rect for the background sprite, in canvas space. */
export function backgroundRect(): { x: number; y: number; width: number; height: number } {
  const width = CANVAS_W * BG_ZOOM;
  const height = CANVAS_H * BG_ZOOM;
  return { x: (CANVAS_W - width) / 2, y: BG_GRASS_DST_Y - BG_GRASS_SRC_Y * BG_ZOOM, width, height };
}

/**
 * The wall is one sprite spanning the band, not a copy per depth row.
 *
 * The band is a fake projection: depth costs ~180px of y but only 1.4x of scale, so it implies far more
 * ground distance than the scale does. Any object taller than a unit breaks on it. Drawing the wall once
 * per row bottom-anchors each copy on its own ground line, which puts the FAR copy's top edge above the
 * near one's -- the opposite of perspective, where a receding wall's top edge drops toward the horizon.
 * No row count or scale curve fixes that (it needs the sprite to shrink faster than the band rises, i.e.
 * negative height at the back), so the rows read as a stack of panels however finely they are spaced.
 * One sprite stretched over the band has no such contradiction, and matches the flat side-on wall of the
 * games this is modelled on. Units sort in front of or behind it by zIndex at WALL_DEPTH.
 */
export const WALL_DEPTH = 0.5;
export const WALL_X_SCALE = 1.18;
/** Top of the wall, a little above the far ground line so the back of the band is covered. */
export const WALL_TOP_Y = BAND_FAR_Y - 10;
/** Bottom, a little below the near ground line so the front of the band is covered. */
export const WALL_BOTTOM_Y = BAND_NEAR_Y + 12;

/** Render-only clearance so units do not stand inside the wall sprite (the sim wall has no thickness). */
export const WALL_CLEAR_PX = 96;
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
