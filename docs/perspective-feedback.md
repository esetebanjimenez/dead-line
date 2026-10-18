# Dead Line: Battlefield Perspective — Diagnosis and Fixes

Living version: https://claude.ai/code/artifact/2e81ad06-61d9-4888-82e6-08bb5eed3fa6

As of 2026-10-18.

## Summary

One line of code caused every perspective problem in the battlefield: `project()` in
`src/render/project.ts` mapped depth to a **y offset only**, with no horizontal component.

The wall is a line of constant sim `x`. With no horizontal term in the projection, that line can
only ever render as a vertical slab in the middle of the field. Everything that looked wrong
followed from this:

- The wall drawn as three stacked copies read as a pile of fence panels, not a wall.
- The playable ground was a 130px strip at the bottom of a 720px frame, under a screenful of sky.
- There was nowhere for a gate to go, so the gate sat off to the far left as a separate prop.

Two rounds of fixes treated symptoms before the cause was found. Adding a horizontal component to
depth (`DEPTH_SHEAR_X`) tilts the ground plane, and the wall becomes a long diagonal run for free —
panels tiled along it land *beside* each other instead of on top of each other.

The geometry now matches the reference. What remains is an **art problem, not a code problem**: the
renderer draws an angled ground plane, but every sprite in `public/art/` is drawn side-on. Soldiers
on a parapet and towers built into the wall line cannot be done with the current asset set.

## The reference, measured

Measured off the reference screenshot supplied by the team:

| Property | Reference | Dead Line now |
| --- | --- | --- |
| Wall angle below horizontal | ~28° | 31° |
| Panel reveal (step along the run) | ~90px | ~33% of panel width |
| Panel rise per step | ~45px | derived from the angle |
| Wall exits frame | both ends | both ends |
| Sky visible | none | none |
| Perspective scale falloff | none (isometric) | floored at 0.45 |

The reference is a **top-down / isometric** view. Two consequences matter for planning:

First, a true isometric projection has **no size falloff with distance** — a unit at the back of the
field is the same size as one at the front. Our projection still scales with depth, which is why
`SCENERY_MIN_SCALE` exists: without a floor, the linear scale curve reaches zero and then goes
negative on scenery drawn past the band. Moving to a flat scale would be more faithful and would
delete that floor.

Second, and more expensive: the reference art is **drawn for that angle**. Its wall has a walkway on
top with soldiers standing on it, towers built into the line, and a gate with a bridge over a moat.
Our wall is a side-on palisade panel with finished end posts and no walkway.

## Root cause: depth had no horizontal component

The codebase is explicit that `project()` is the single place mapping sim state to screen, and the
sim stays 1D on `x`. That design is sound. The bug was in the mapping itself.

The original:

    x_screen = x * S
    y_screen = y_near + (y_far - y_near) * d

Depth `d` moves a sprite **up the screen and nowhere else**. So the set of points sharing one sim
`x` — the wall — maps to a vertical line. No amount of tiling, scaling or art changes that.

The fix adds a horizontal term:

    x_screen = x * S + d * K

with `K = DEPTH_SHEAR_X = 300`. The ground is now seen at an angle: moving away from the camera
travels up **and to the right**. The wall becomes a diagonal run at 31° below horizontal, which is
`atan(180 / 300)` from the band depth and the shear.

The sim never changed. `wallX` is still 260, units still compare positions on one axis, and the
balance is identical — both commits touch `src/render/` only.

## Why the stacked wall could not be tiled away

This is worth recording, because the obvious fix — "use more, finer wall rows" — was tried and made
things **worse**, turning the stack into a sandbag ramp. It cannot work, and here is why.

Each row was bottom-anchored on its own ground line. With band near `610`, far `430`, and a sprite
of height `h` scaled by `s(d)`:

    y_bottom(d) = 610 - 180d
    y_top(d)    = y_bottom(d) - h * s(d)

In real perspective a receding wall's top edge **drops toward the horizon** as `d` grows. That
requires `y_top` to increase with `d`:

    d/dd [ h * s(d) ] < -180

With `h = 102` that needs `s'(d) < -1.76`. Starting from `s(0) = 1.15`, the sprite would have to
reach **negative height** before the back of the band.

So with a vertical projection, no row count and no scale curve produces a wall. The rows read as
stacked panels however finely they are spaced — finer spacing just makes the staircase denser,
because the repeated element is the panel's distinctive sandbag cap.

The real problem was never the tiling. It was that depth had no horizontal component, so the band
spent 180px of `y` on depth while implying only 1.4x of scale — far more ground distance than the
scale said. **Any object taller than a unit breaks on that projection.** Once the shear exists,
tiling works immediately, and the step is mostly sideways rather than upward.

## What has been fixed

Two commits on `ccr-854cfcb6-v65zog`, all render-only. Build, lint and 45 tests pass on each.

| Commit | Change |
| --- | --- |
| `e377898` | Camera re-crop; wall as a single stretched sprite (superseded) |
| `73a62bc` | Angled ground plane; wall as a tiled diagonal run with a gate |

Constants now in force, all in `src/render/project.ts`:

| Constant | Value | Purpose |
| --- | --- | --- |
| `DEPTH_SHEAR_X` | 300 | Horizontal travel per unit of depth — the fix |
| `X_SCALE` | 0.98 | Sim x -> screen, using what the shear leaves of 1280px |
| `BAND_NEAR_Y` / `BAND_FAR_Y` | 610 / 430 | 180px-deep ground band |
| `SCALE_NEAR` / `SCALE_FAR` | 1.15 / 0.82 | Unit size by depth |
| `SCENERY_MIN_SCALE` | 0.45 | Floor, so scenery past the band never reaches zero |
| `WALL_DEPTH_MIN` / `MAX` | -0.85 / 3.3 | Run exits the frame at both ends |
| `WALL_STEP_FRAC` | 0.33 | Panel advance, as a fraction of its own width |
| `GATE_DEPTH` | 0.5 | Gate sits mid-band, where troops march out |
| `WALL_CLEAR_PX` | 96 | Keeps troops out of the ~190px-wide run |

Three bugs the new geometry exposed, each caught only by screenshotting the running game:

1. **The far half of the wall rendered behind the backdrop.** Segments past the band get negative
   `zIndex`; the background sat at `-10`. Moved to `-1_000_000`.
2. **The pressure cue became a red stripe across the whole screen.** It was stroked along the entire
   run. Now a ground decal along the held stretch only.
3. **Defenders vanished.** The run is ~190px wide and draws over same-depth units, but
   `wallClearance` applied only to enemies. It now applies to every entity.

Step sizing deserves a note: the panel advance is computed from **each panel's own on-screen
width**, not a fixed depth increment. Panels shrink toward the back, so an even depth step overlaps
the near end heavily and leaves visible gaps at the far end — which is exactly what the first
attempt showed.

## What is still wrong

The geometry matches. These are the gaps, in priority order.

**1. No parapet, so no soldiers on the wall.** `wall_t1_intact_00.png` is a solid palisade panel
with no walkway. There is nowhere for a defender to stand, and no unit has a wall-mounted pose. This
is the most visible difference from the reference.

**2. Towers are not part of the wall.** `tower_t1_idle_00.png` is a free-standing structure placed
on the ground behind the line. In the reference, towers are built into the fortification at
intervals and are where the ballistas sit.

**3. Side-on sprites in an angled view.** Every character, the wall, the gate and the backdrop are
drawn side-on. At the current 31° shear this reads acceptably — but it is the reason items 1 and 2
cannot simply be bolted on. A parapet drawn side-on will not sit correctly on an angled wall.

**4. The backdrop is a side-view frame being upscaled 1.75x.** `env_kingdom_bg.png` is a single
1280x720 image with sky, hills, treeline and grass. To remove the sky we crop to the grass band and
zoom, which costs resolution and throws away most of the scenery. It should be ground-plane art,
ideally tileable.

**5. The gate and base have visually merged, but not in the sim.** The gate now sits in the wall run
at `wallX` (260). The base is still a separate HP pool at `baseX` (40) with no sprite of its own.
When the wall falls, enemies walk past the gate to attack an invisible base 220 world-units further
left. See open decisions.

**6. Panel end posts repeat every step.** The art has finished posts at both ends, so tiling it
shows a post at each reveal. It currently reads as a regular palisade, which is tolerable, but it is
luck rather than design — the asset was never drawn to tile.

## Art assets needed

Every asset below must be drawn for a ground plane where **moving away from the camera travels up
and to the right at 31° below horizontal**. That angle is set by `DEPTH_SHEAR_X` and the band depth,
and can be changed to suit the art — but it must be agreed before anything is drawn, because it is
baked into every asset.

| Asset | Constraint | Replaces |
| --- | --- | --- |
| Wall panel | Tileable along the 31° run, seamless left/right, no finished end posts | `wall_t1_*` (169x102) |
| Wall panel + parapet | Same, plus a walkway with a standing surface at a known pixel offset | new |
| Defender, wall pose | Standing on the parapet, firing; one per defender type | new |
| Tower | Built into the wall line, same 31°, sits at a panel boundary | `tower_t1_idle` (106x154) |
| Gatehouse | In the run, taller than the panels, with a visible opening | reuses `base_t1_intact` (208x132) |
| Ground plane | Tileable grass with scatter, no sky, no horizon | `env_kingdom_bg` (1280x720) |
| Damage states | 66% and 33% for every wall piece above | `wall_t1_damaged*` |

Two specification notes that will save a re-draw:

**The wall panel needs a declared tiling width.** The renderer advances each panel by
`WALL_STEP_FRAC` (0.33) of its own width. If the art has a natural repeat — posts every N pixels —
tell us that number and we will set the step to match it exactly, so posts land on the repeat
instead of wherever the fraction falls.

**The parapet needs a declared standing offset.** For units to stand on the wall, the art must
specify where the walkway surface is, in pixels from the sprite's bottom-left. `src/render/artMeta.ts`
already carries exactly this kind of per-sprite data (the Ram's `anchorX`, `bodyOffsetX`, `shiftX`),
so the plumbing exists.

## Code follow-ups

Ordered by value per unit of effort. None are blocked on art except where stated.

1. **Wall-mounted unit slots.** Blocked on parapet art. Needs a standing offset in `artMeta.ts`, a
   render path that places defenders on the wall rather than the ground band, and a decision on
   whether this is purely visual or a real sim position. Purely visual is far cheaper and probably
   indistinguishable in play.
2. **Flat scale for a true isometric look.** Set `SCALE_NEAR = SCALE_FAR` and `SCENERY_MIN_SCALE`
   becomes unnecessary. One line, reversible, worth trying against the reference before
   commissioning art. Changes how crowds read, so screenshot it.
3. **Tileable ground plane.** Blocked on art. Removes `BG_ZOOM` / `BG_GRASS_SRC_Y` /
   `BG_GRASS_DST_Y` entirely, replacing them with a tiling draw. Also fixes the upscaling blur.
4. **Step the wall on the art's natural repeat.** Replace `WALL_STEP_FRAC` with a pixel repeat width
   once the art declares one.
5. **Depth jitter is doing less work than it should.** `MAX_JITTER_X` is 6px and `depthOf()` spreads
   units across the band by a hash of entity id. With the shear in place, depth now moves units
   diagonally, so the same jitter reads differently. Worth re-tuning once crowd sizes go up.
6. **Give the base a sprite, or merge it into the gate.** See open decisions — this is a design
   call, not a rendering one.

One process note. All three of the bugs listed under *What has been fixed* were invisible in code
review and obvious in a screenshot. The render path now has enough geometry in it that **every
change should be verified against a running screenshot**, not reasoned about. The `?stress=N`
parameter is genuinely useful for this: it fills the field with dummies and shows crowd behaviour
the real waves never produce.

## Open decisions

These need a call from design before art is commissioned. The first is the expensive one.

**Are we committing to the isometric look?** The reference is a top-down game; our entire asset set
is side-on. The geometry fix works with the existing art, and at 31° the side-on characters read
acceptably. But parapet soldiers and integrated towers are exactly where the mismatch starts to
show, because those pieces must be drawn for the angle. Commissioning them means committing — and
eventually re-drawing the character set too. Worth deciding deliberately rather than discovering
halfway through.

**Is the shear angle right at 31°?** The reference measures ~28°. Changing it is one constant today
and a re-draw once art exists. Lock it before anything is commissioned.

**Should the gate be the base?** Right now the sim has a wall (400 HP at `wallX` 260) and a base
(500 HP at `baseX` 40) as separate objects, but the screen shows one fortification. Three options:

1. Merge them — one structure, one HP pool. Simplest to read, matches the reference, but removes the
   two-stage defeat the waves are tuned around.
2. Keep both, give the base its own structure further back — a keep behind the wall. Preserves the
   tuning and gives the camera something to defend.
3. Leave as is — the base is abstract and only ever seen as a HUD bar. Cheapest, but the fall of the
   wall currently leads to enemies attacking nothing visible.

Option 2 is the most faithful to the reference and does not disturb balance, at the cost of one more
art asset.

**Do wall-mounted defenders occupy real sim positions?** A purely visual placement is far cheaper
and very likely indistinguishable in play. A real position means reworking `holdOffset` and the
targeting in `combat.ts`, and would change balance.
