// Isometric (2:1 dimetric) projection helpers.
//
// Grid space:  +x goes "east" (right-down), +y goes "south" (left-down),
//              +z goes "up" (toward the viewer / top of screen).
// Screen space: standard SVG coords (y grows downward).

// Grid units are feet. These keep the whole (long, narrow) plan a sane size
// so fixed-size labels/dots read well after the SVG auto-fits to the viewport.
export const TILE_W = 30; // screen width of one grid unit's diamond
export const TILE_H = 15; //  screen height of one grid unit's diamond (2:1)
export const TILE_Z = 15; //  screen pixels per grid unit (foot) of height

export interface Pt {
  x: number;
  y: number;
}

/** Project a grid point (gx, gy, gz) to screen coordinates. */
export function project(gx: number, gy: number, gz = 0): Pt {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2) - gz * TILE_Z,
  };
}

/** Serialize points into an SVG polygon `points` attribute. */
export function poly(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export interface Wall {
  pts: Pt[];
  /** "right" = east-facing (lighter shade), "left" = south-facing (darker). */
  face: "left" | "right";
}

export interface RoomGeometry {
  floor: Pt[]; // top face outline (the clickable polygon)
  walls: Wall[]; // visible front/right faces, back-to-front
  centroid: Pt; // label anchor
}

/** A rectangular corner removed from the front-right (max-x, max-y) corner. */
export interface Notch {
  w: number;
  d: number;
}

/** Compute projected geometry for a room footprint, optionally L-shaped via a
 *  front-right corner notch. A vertical wall is emitted for each visible
 *  (south- or east-facing) edge so a removed corner reads as a real cutout. */
export function roomGeometry(
  x: number,
  y: number,
  w: number,
  d: number,
  height: number,
  notch?: Notch
): RoomGeometry {
  const P = (gx: number, gy: number, gz = 0) => project(gx, gy, gz);
  // East-facing wall along constant x, from gy0 to gy1.
  const eastWall = (gx: number, gy0: number, gy1: number): Wall => ({
    face: "right",
    pts: [P(gx, gy0, height), P(gx, gy1, height), P(gx, gy1, 0), P(gx, gy0, 0)],
  });
  // South-facing wall along constant y, from gx0 to gx1.
  const southWall = (gy: number, gx0: number, gx1: number): Wall => ({
    face: "left",
    pts: [P(gx1, gy, height), P(gx0, gy, height), P(gx0, gy, 0), P(gx1, gy, 0)],
  });

  const xr = x + w;
  const yb = y + d;

  if (!notch) {
    return {
      floor: [P(x, y, height), P(xr, y, height), P(xr, yb, height), P(x, yb, height)],
      walls: [eastWall(xr, y, yb), southWall(yb, x, xr)],
      centroid: P(x + w / 2, y + d / 2, height),
    };
  }

  // L-shape: notch out the front-right corner.
  const xs = xr - notch.w; // inner step x
  const ys = yb - notch.d; // inner step y
  return {
    floor: [
      P(x, y, height),
      P(xr, y, height),
      P(xr, ys, height),
      P(xs, ys, height),
      P(xs, yb, height),
      P(x, yb, height),
    ],
    walls: [
      eastWall(xr, y, ys), //   outer east, above the notch
      southWall(ys, xs, xr), // inner step facing south
      eastWall(xs, ys, yb), //  inner step facing east
      southWall(yb, x, xs), //  outer south, left of the notch
    ],
    // Anchor the label in the solid (non-notched) part of the room.
    centroid: P(x + (w - notch.w) / 2, y + d / 2, height),
  };
}

/** Project a point inside a room given normalized (u, v) in 0..1. */
export function spotInRoom(
  x: number,
  y: number,
  w: number,
  d: number,
  height: number,
  u: number,
  v: number
): Pt {
  return project(x + u * w, y + v * d, height);
}
