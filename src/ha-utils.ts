import type { Hass, HassEntity, RoomConfig, DeviceRef } from "./types.js";

export const domainOf = (entityId: string): string => entityId.split(".")[0];

// --- Area -> entities resolution -------------------------------------------

// Domains worth surfacing in a room panel, in display order. Anything else
// (and config/diagnostic/hidden entities) is skipped by the auto-fill.
const AREA_DOMAIN_ORDER = [
  "light",
  "climate",
  "cover",
  "fan",
  "switch",
  "media_player",
  "lock",
  "vacuum",
  "humidifier",
  "input_boolean",
  "binary_sensor",
  "sensor",
];
const AREA_DOMAINS = new Set(AREA_DOMAIN_ORDER);

/** Default HA Label id used to hide entities from the panel. */
export const DEFAULT_HIDE_LABELS = ["no_panel"];

/** Match a room's `area` (an area_id or a display name) to a real area_id. */
export function resolveAreaId(hass: Hass, areaRef: string): string | undefined {
  if (!hass.areas) return undefined;
  if (hass.areas[areaRef]) return areaRef; // already an area_id
  const lc = areaRef.toLowerCase();
  return Object.values(hass.areas).find((a) => a.name?.toLowerCase() === lc)?.area_id;
}

/** Controllable entity_ids assigned to an area (directly or via their device).
 *  Entities carrying any of `excludeLabels` (HA Label ids) — on the entity
 *  itself or on its device — are skipped. */
export function entitiesInArea(
  hass: Hass,
  areaId: string,
  excludeLabels: string[] = []
): string[] {
  const entities = hass.entities ?? {};
  const exclude = new Set(excludeLabels.map((l) => l.toLowerCase()));
  const hasExcludedLabel = (labels: string[] | null | undefined) =>
    !!labels?.some((l) => exclude.has(l.toLowerCase()));
  const result: string[] = [];
  for (const e of Object.values(entities)) {
    if (e.hidden || e.hidden_by) continue;
    if (e.entity_category === "config" || e.entity_category === "diagnostic") continue;
    const device = e.device_id ? hass.devices?.[e.device_id] : undefined;
    if (exclude.size && (hasExcludedLabel(e.labels) || hasExcludedLabel(device?.labels)))
      continue;
    if (!AREA_DOMAINS.has(domainOf(e.entity_id))) continue;
    const area =
      e.area_id ?? (e.device_id ? hass.devices?.[e.device_id]?.area_id : null);
    if (area !== areaId) continue;
    if (!hass.states[e.entity_id]) continue; // skip not-yet-loaded entities
    result.push(e.entity_id);
  }

  // Collapse HA groups (group helpers, light/switch groups): a group entity
  // exposes its members via the `entity_id` attribute. If the group is in this
  // area, drop its members so the room shows the single virtual device instead
  // of the group plus each underlying entity (which also de-dupes doubles).
  const members = new Set<string>();
  for (const id of result) {
    const g = hass.states[id]?.attributes.entity_id;
    if (Array.isArray(g)) for (const m of g) members.add(m);
  }
  const collapsed = result.filter((id) => !members.has(id));

  const rank = (id: string) => {
    const i = AREA_DOMAIN_ORDER.indexOf(domainOf(id));
    return i === -1 ? AREA_DOMAIN_ORDER.length : i;
  };
  return collapsed.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The effective devices for a room: explicit list wins, else Area auto-fill
 *  (with entities carrying any `excludeLabels` filtered out). */
export function roomDevices(
  hass: Hass | undefined,
  room: RoomConfig,
  excludeLabels: string[] = []
): DeviceRef[] {
  if (room.devices?.length) return room.devices;
  if (hass && room.area) {
    const areaId = resolveAreaId(hass, room.area);
    if (areaId)
      return entitiesInArea(hass, areaId, excludeLabels).map((entity_id) => ({ entity_id }));
  }
  return room.devices ?? [];
}

// --- Multi-sensor devices -> one combined card -------------------------------

export type SensorGroupKind = "electrical" | "environmental";

// device_class sets that merge into a combined card when one physical device
// exposes 2+ of them (e.g. a smart outlet's power/voltage/current sensors, or
// an ambient sensor's temperature/humidity/pressure).
const GROUP_CLASSES: [SensorGroupKind, Set<string>][] = [
  [
    "electrical",
    new Set([
      "power",
      "energy",
      "current",
      "voltage",
      "frequency",
      "power_factor",
      "apparent_power",
      "reactive_power",
    ]),
  ],
  [
    "environmental",
    new Set(["temperature", "humidity", "pressure", "atmospheric_pressure", "illuminance"]),
  ],
];

const groupKindOf = (entity: HassEntity | undefined): SensorGroupKind | null => {
  const dc = entity?.attributes.device_class;
  if (typeof dc !== "string") return null;
  for (const [kind, classes] of GROUP_CLASSES) if (classes.has(dc)) return kind;
  return null;
};

export interface SensorGroupItem {
  ref: DeviceRef;
  /** Short reading label: the friendly name minus the device-name prefix. */
  label: string;
}

export interface SensorGroup {
  kind: SensorGroupKind;
  name: string;
  items: SensorGroupItem[];
}

export const isSensorGroup = (item: DeviceRef | SensorGroup): item is SensorGroup =>
  "items" in item;

// Display order for readings within a combined card.
const CLASS_ORDER: Record<SensorGroupKind, string[]> = {
  electrical: [
    "voltage",
    "current",
    "power",
    "apparent_power",
    "reactive_power",
    "frequency",
    "power_factor",
    "energy",
  ],
  environmental: ["temperature", "humidity", "pressure", "atmospheric_pressure", "illuminance"],
};

function sortGroupItems(
  hass: Hass,
  kind: SensorGroupKind,
  items: SensorGroupItem[]
): SensorGroupItem[] {
  const order = CLASS_ORDER[kind];
  const classOf = (i: SensorGroupItem): string => {
    const dc = hass.states[i.ref.entity_id]?.attributes.device_class;
    return typeof dc === "string" ? dc : "";
  };
  const rank = (i: SensorGroupItem) => {
    const idx = order.indexOf(classOf(i));
    return idx === -1 ? order.length : idx;
  };
  // Among readings of the same class, the plainly-named one leads
  // ("Power" before "Instantaneous Demand").
  const plain = (i: SensorGroupItem) =>
    i.label.toLowerCase() === classOf(i).replace(/_/g, " ") ? 0 : 1;
  return items.sort(
    (a, b) => rank(a) - rank(b) || plain(a) - plain(b) || a.label.localeCompare(b.label)
  );
}

/** Merge sensors that belong to one physical device (and one kind) into a
 *  SensorGroup; everything else passes through untouched. A group takes the
 *  list position of its first member. */
export function groupRoomDevices(
  hass: Hass | undefined,
  refs: DeviceRef[]
): (DeviceRef | SensorGroup)[] {
  if (!hass) return refs;
  const keyOf = (ref: DeviceRef): string | null => {
    if (domainOf(ref.entity_id) !== "sensor") return null;
    const kind = groupKindOf(hass.states[ref.entity_id]);
    const deviceId = hass.entities?.[ref.entity_id]?.device_id;
    return kind && deviceId ? `${deviceId}::${kind}` : null;
  };

  const byKey = new Map<string, DeviceRef[]>();
  for (const ref of refs) {
    const key = keyOf(ref);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(ref);
  }

  const emitted = new Set<string>();
  const out: (DeviceRef | SensorGroup)[] = [];
  for (const ref of refs) {
    const key = keyOf(ref);
    const members = key ? byKey.get(key)! : [];
    if (!key || members.length < 2) {
      out.push(ref);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const [deviceId, kind] = key.split("::") as [string, SensorGroupKind];
    const device = hass.devices?.[deviceId];
    const name =
      device?.name_by_user ?? device?.name ?? friendlyName(hass, members[0].entity_id);
    out.push({
      kind,
      name,
      items: sortGroupItems(
        hass,
        kind,
        members.map((m) => ({ ref: m, label: readingLabel(hass, m, name) }))
      ),
    });
  }
  return out;
}

/** "Office Outlet Power" on device "Office Outlet" -> "Power". */
function readingLabel(hass: Hass, ref: DeviceRef, deviceName: string): string {
  const full = ref.name ?? friendlyName(hass, ref.entity_id);
  const stripped = full.toLowerCase().startsWith(deviceName.toLowerCase())
    ? full.slice(deviceName.length).replace(/^[\s:·–-]+/, "")
    : full;
  return stripped || full;
}

export function friendlyName(hass: Hass | undefined, entityId: string): string {
  const e = hass?.states[entityId];
  return (
    e?.attributes.friendly_name ??
    entityId.split(".")[1]?.replace(/_/g, " ") ??
    entityId
  );
}

/** Domains we render as on/off toggles. */
const TOGGLE_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "input_boolean",
  "automation",
  "script",
  "media_player",
]);

export const isToggleable = (entityId: string): boolean =>
  TOGGLE_DOMAINS.has(domainOf(entityId));

const ON_STATES = new Set(["on", "open", "playing", "home", "active"]);

export function isOn(entity: HassEntity | undefined): boolean {
  if (!entity) return false;
  return ON_STATES.has(entity.state);
}

/** True if the entity is unavailable / unknown / not present. */
export function isUnavailable(entity: HassEntity | undefined): boolean {
  return !entity || entity.state === "unavailable" || entity.state === "unknown";
}

/** Toggle any on/off-ish entity. Uses homeassistant.toggle as a safe default. */
export function toggle(hass: Hass, entityId: string): void {
  const domain = domainOf(entityId);
  const service = TOGGLE_DOMAINS.has(domain) ? domain : "homeassistant";
  hass.callService(service, "toggle", { entity_id: entityId });
}

/** Set a light's brightness from a 0..100 percentage. */
export function setBrightnessPct(hass: Hass, entityId: string, pct: number): void {
  hass.callService("light", "turn_on", {
    entity_id: entityId,
    brightness_pct: Math.round(pct),
  });
}

export function brightnessPct(entity: HassEntity | undefined): number {
  const b = entity?.attributes.brightness;
  return typeof b === "number" ? Math.round((b / 255) * 100) : 0;
}

/** Nudge a climate setpoint by `delta` degrees. */
export function bumpTemperature(hass: Hass, entityId: string, delta: number): void {
  const entity = hass.states[entityId];
  const current = Number(entity?.attributes.temperature ?? 20);
  hass.callService("climate", "set_temperature", {
    entity_id: entityId,
    temperature: Math.round((current + delta) * 2) / 2, // 0.5° steps
  });
}

export function coverCommand(
  hass: Hass,
  entityId: string,
  cmd: "open" | "close"
): void {
  hass.callService("cover", `${cmd}_cover`, { entity_id: entityId });
}

/** Set a cover's position from a 0..100 percentage (100 = fully open). */
export function setCoverPosition(hass: Hass, entityId: string, pct: number): void {
  hass.callService("cover", "set_cover_position", {
    entity_id: entityId,
    position: Math.round(pct),
  });
}

const COVER_SUPPORT_SET_POSITION = 4;

/** The cover's 0..100 position (100 = open), or null if it doesn't report one. */
export function coverPositionPct(entity: HassEntity | undefined): number | null {
  const p = entity?.attributes.current_position;
  return typeof p === "number" ? Math.round(p) : null;
}

/** True if the cover accepts cover.set_cover_position. */
export function coverSupportsPosition(entity: HassEntity | undefined): boolean {
  const features = entity?.attributes.supported_features;
  if (typeof features === "number") return (features & COVER_SUPPORT_SET_POSITION) !== 0;
  // Some integrations omit supported_features in older HA; fall back to the
  // presence of a reported position.
  return coverPositionPct(entity) != null;
}

/** Round numeric-looking values to 2 decimals (dropping trailing zeros); pass
 *  non-numeric values (e.g. "on", "unknown") through unchanged. */
export function fmtNumber(value: string | number): string {
  if (value === "" || value == null) return String(value ?? "");
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(value);
}

/** A short, human display value for read-only entities. */
export function displayState(entity: HassEntity | undefined): string {
  if (!entity) return "—";
  const unit = entity.attributes.unit_of_measurement;
  const val = fmtNumber(entity.state);
  return unit ? `${val} ${unit}` : val;
}
