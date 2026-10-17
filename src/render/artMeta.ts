/** Per-sprite art data, keyed by art kind (see Renderer.artKind). Anything not listed uses the defaults: scale 1, anchored bottom-centre, no cart bob. */
export interface ArtMeta {
  scale: number; // sprite scale on top of the depth scale. Size by texture: the art is drawn on a shared scale, so 1 keeps the Ram ~1.6x the Hammer Knight's body.
  anchorX: number; // 0..1 across the texture: the pixel column that sits at the entity's sim x
  shadowWidth: number; // half-width of the ground shadow in world px
  bodyOffsetX: number; // body centre relative to the anchor, in sprite px facing right (the shadow and health bar sit there)
  barWidth?: number; // health bar width in world px (default: the unit's def width)
  bob?: { amplitude: number; speed: number }; // vertical cart bob while moving (px, rad/s), a bounce that never dips below the ground
}

export const DEFAULT_ART_META: ArtMeta = { scale: 1, anchorX: 0.5, shadowWidth: 26, bodyOffsetX: 0 };

export const ART_META: Record<string, ArtMeta> = {
  // Battering Ram, 312x208 frames drawn facing right. Sim x is the front of the log (range is measured from the log tip),
  // and the log tip is at pixel 310 of 312 in the idle frame. The wheel bottoms are on the canvas floor (anchor y = 1).
  ram: { scale: 1, anchorX: 310 / 312, shadowWidth: 120, bodyOffsetX: -(310 - 181), barWidth: 90, bob: { amplitude: 5, speed: 7 } },
};

export function artMeta(kind: string): ArtMeta {
  return ART_META[kind] ?? DEFAULT_ART_META;
}
