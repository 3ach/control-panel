import type { FloorplanConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Bundled DEMO layout.
//
// This is a generic sample home shown when no real layout is supplied. Your
// actual floor plan is NOT stored here — it's passed in at runtime from Home
// Assistant via the panel_custom `config:` block (kept in a private YAML on
// your HA instance, so it never lives in this public repo). See the README
// and control-panel-floorplan.example.yaml for the format.
//
// Coordinates are in feet; x is width (left/right), y is length (top->bottom).
// Each room maps to a Home Assistant AREA via `area`; the panel auto-fills that
// area's controllable entities. `npm run dev` renders this demo against a mock
// HA (src/mock-hass.ts), so keep the two in sync.
// ---------------------------------------------------------------------------

// Memphis palette
const C = {
  purple: "#9b5de5",
  lilac: "#c8a8f0",
  blue: "#3fa7ff",
  sky: "#4fc3f7",
  teal: "#2ec4b6",
  green: "#57cc99",
  yellow: "#ffd23f",
  orange: "#ff924c",
  coral: "#ff5a5f",
  pink: "#ff4f9a",
};

export const FLOORPLAN: FloorplanConfig = {
  levels: [
    { id: "main", name: "Main" },
    { id: "upper", name: "Upstairs" },
  ],
  rooms: [
    // ---- Main floor -----------------------------------------------------
    {
      id: "living_room",
      name: "Living Room",
      level: "main",
      x: 0, y: 0, w: 12, d: 10,
      // Front-right corner carved out for the Kitchen (L-shaped demo).
      notch: { w: 4, d: 4 },
      color: C.coral,
      area: "Living Room",
    },
    {
      id: "kitchen",
      name: "Kitchen",
      level: "main",
      x: 8, y: 6, w: 4, d: 4,
      color: C.yellow,
      area: "Kitchen",
    },
    {
      id: "bedroom",
      name: "Bedroom",
      level: "main",
      x: 0, y: 10, w: 6, d: 8,
      color: C.purple,
      area: "Bedroom",
    },
    {
      id: "bathroom",
      name: "Bathroom",
      level: "main",
      x: 6, y: 10, w: 6, d: 8,
      color: C.teal,
      area: "Bathroom",
    },

    // ---- Upstairs -------------------------------------------------------
    {
      id: "office",
      name: "Office",
      level: "upper",
      x: 0, y: 0, w: 7, d: 8,
      color: C.blue,
      area: "Office",
    },
    {
      id: "guest_room",
      name: "Guest Room",
      level: "upper",
      x: 7, y: 0, w: 5, d: 8,
      color: C.orange,
      area: "Guest Room",
    },
    {
      id: "upstairs_bath",
      name: "Upstairs Bath",
      level: "upper",
      x: 0, y: 8, w: 12, d: 5,
      color: C.sky,
      area: "Upstairs Bath",
    },
  ],
};
