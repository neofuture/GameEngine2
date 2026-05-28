export const FLOOR_THICKNESS = 0.2;
export const FLOOR_Y = -FLOOR_THICKNESS / 2;
/** Collider-only embed — visual meshes use WALL_VISUAL_FLOOR_EMBED. */
export const WALL_FLOOR_EMBED = 0.06;
/** Walk-support padding at floor edges (not used for overlapping floor meshes). */
export const FLOOR_WALL_OVERLAP = 0.08;
/** Visual wall base sits slightly into the slab so grazing angles don't reveal void. */
export const WALL_VISUAL_FLOOR_EMBED = 0.05;
/** Clearance from the arena inner wall face to the player's body edge. */
export const WALL_STANDOFF = 0.5;

/** Visual wall center Y — mesh bottom at y = -WALL_VISUAL_FLOOR_EMBED. */
export function wallVisualCenterY(height) {
  return height / 2 - WALL_VISUAL_FLOOR_EMBED;
}

/** @deprecated Use wallVisualCenterY for meshes; colliders use -WALL_FLOOR_EMBED bottomY. */
export function wallCenterY(height) {
  return wallVisualCenterY(height);
}
