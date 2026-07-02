// ---- Home Assistant surface we rely on -------------------------------------
// HA passes a `hass` object into custom panels. We only type the bits we use.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    brightness?: number; // 0-255 for lights
    icon?: string;
  };
  last_changed?: string;
}

export interface HassAreaEntry {
  area_id: string;
  name: string;
}

export interface HassEntityEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  hidden_by?: string | null;
  entity_category?: string | null; // "config" | "diagnostic" | null
}

export interface HassDeviceEntry {
  id: string;
  area_id?: string | null;
}

export interface Hass {
  states: Record<string, HassEntity>;
  // Registries HA puts on the hass object; used to resolve entities by Area.
  areas?: Record<string, HassAreaEntry>;
  entities?: Record<string, HassEntityEntry>;
  devices?: Record<string, HassDeviceEntry>;
  // language/theme etc. exist on the real object; we ignore them here.
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, any>,
    target?: { entity_id?: string | string[] }
  ): Promise<unknown>;
}

// ---- Floorplan config ------------------------------------------------------
// A room is a rectangular footprint on a grid, projected to isometric space.
// Coordinates are in grid units; (0,0) is the top of the iso diamond.

export interface DeviceRef {
  entity_id: string;
  /** Override the friendly name from HA. */
  name?: string;
  /** Optional position of the device dot inside the room, 0..1 of width/depth.
   *  Defaults to spreading devices across the room floor automatically. */
  spot?: { u: number; v: number };
}

export interface RoomConfig {
  id: string;
  name: string;
  /** Grid footprint. */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Wall height in grid units (visual only). Default 4. */
  height?: number;
  /** Remove a rectangular chunk from the front-right corner, making the room
   *  L-shaped — e.g. a Great Room with a Bar tucked into the cutout. */
  notch?: { w: number; d: number };
  /** Floor accent color (CSS). Falls back to the theme accent. */
  color?: string;
  /** Multi-floor support: matches a LevelConfig.id. Rooms on the active
   *  level render together. Omit if the home has a single level. */
  level?: string;
  /** HA Area this room maps to (area_id or display name). Its controllable
   *  entities are pulled in automatically. */
  area?: string;
  /** Explicit device list. If present, overrides the Area auto-fill for this
   *  room (curate exactly what shows, or handle a room with no Area). */
  devices?: DeviceRef[];
}

export interface LevelConfig {
  id: string;
  name: string;
}

export interface FloorplanConfig {
  title?: string;
  /** Floors, in display order. Omit for a single-level home. */
  levels?: LevelConfig[];
  rooms: RoomConfig[];
}
