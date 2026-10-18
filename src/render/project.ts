/** Single place that maps sim state (x, depth) to screen. Render-only; the sim stays 1D on x. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
/**
 * The ground is seen at an angle, so moving away from the camera (depth 0 -> 1) travels up the screen
 * AND to the right. This horizontal component is what makes the wall -- a line of constant sim x --
 * come out as a long diagonal run instead of a vertical slab. Without it no amount of tiling can help:
 * segments land on top of each other rather than beside each other.
 */
export const DEPTH_SHEAR_X = 300;
/** Sim x range (0..1000) is stretched to what the shear leaves of the canvas width. */
export const X_SCALE = (CANVAS_W - DEPTH_SHEAR_X) / 1000;
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
export const SCENERY_MIN_SCALE = 0.45;

/**
 * Background crop. The source art is one 1280x720 frame whose grass begins at BG_GRASS_SRC_Y; it is
 * zoomed and shifted so that line lands at BG_GRASS_DST_Y, just above the band. Everything above the
 * grass (trees, hills, sky) is pushed off the top, which is what tightens the camera onto the ground.
 */
export const BG_ZOOM = 1.75;
export const BG_GRASS_SRC_Y = 420;
export const BG_GRASS_DST_Y = 200;

/** Destination rect for the background sprite, in canvas space. */
export function backgroundRect(): { x: number; y: number; width: number; height: number } {
  const width = CANVAS_W * BG_ZOOM;
  const height = CANVAS_H * BG_ZOOM;
  return { x: (CANVAS_W - width) / 2, y: BG_GRASS_DST_Y - BG_GRASS_SRC_Y * BG_ZOOM, width, height };
}

/**
 * The wall is a run of panels tiled along the depth axis. With DEPTH_SHEAR_X each step moves mostly
 * sideways and only a little up, so consecutive panels sit beside each other and read as one wall
 * climbing to the right -- the stepped fortification line of the reference art.
 *
 * It is drawn well past the band the troops occupy so it leaves the frame at both ends instead of
 * stopping in open grass. Those outer segments are scenery: zIndex still sorts them against the troops.
 */
export const WALL_DEPTH_MIN = -0.85;
export const WALL_DEPTH_MAX = 3.3;
/** How far each panel advances along the run, as a fraction of its own on-screen width. */
export const WALL_STEP_FRAC = 0.33;

/**
 * Depths of the panels in the run. The step is sized from each panel's own on-screen width, not from a
 * fixed depth increment: panels shrink toward the back, so an even depth step overlaps the near end
 * heavily and leaves gaps at the far end.
 */
export function wallSegmentDepths(panelW: number): number[] {
  const out: number[] = [];
  for (let d = WALL_DEPTH_MIN; d <= WALL_DEPTH_MAX && out.length < 64;) {
    out.push(d);
    const scale = Math.max(SCENERY_MIN_SCALE, SCALE_NEAR + (SCALE_FAR - SCALE_NEAR) * d);
    d += Math.max(0.02, (panelW * scale * WALL_STEP_FRAC) / DEPTH_SHEAR_X);
  }
  return out;
}

/** Depth at which the gate sits in the run: mid-band, where the troops march out. */
export const GATE_DEPTH = 0.5;
/** Panels this many steps either side of the gate are dropped, so the gate sits in a real opening. */
export const GATE_GAP_SEGMENTS = 1;
/** The gate is a gatehouse: taller than the panels, so its top clears the wall line even where the run overlaps it. */
export const GATE_SCALE = 1.45;

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

/** Projection without the 0..1 depth clamp, for scenery that runs past the band the troops occupy. */
export function projectRaw(depth: number, x: number): { x: number; y: number; scale: number; z: number } {
  return {
    x: x * X_SCALE + depth * DEPTH_SHEAR_X,
    y: BAND_NEAR_Y + (BAND_FAR_Y - BAND_NEAR_Y) * depth,
    // Floor the scale: the curve is linear and would reach zero (then negative) on scenery drawn far
    // past the band. Entity depths are clamped to 0..1, so this only ever bites on scenery.
    scale: Math.max(SCENERY_MIN_SCALE, SCALE_NEAR + (SCALE_FAR - SCALE_NEAR) * depth),
    z: 1 - depth, // nearer draws on top
  };
}

export function project(depth: number, x: number): { x: number; y: number; scale: number; z: number } {
  return projectRaw(Math.min(1, Math.max(0, depth)), x);
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
