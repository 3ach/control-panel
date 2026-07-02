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

/** Match a room's `area` (an area_id or a display name) to a real area_id. */
export function resolveAreaId(hass: Hass, areaRef: string): string | undefined {
  if (!hass.areas) return undefined;
  if (hass.areas[areaRef]) return areaRef; // already an area_id
  const lc = areaRef.toLowerCase();
  return Object.values(hass.areas).find((a) => a.name?.toLowerCase() === lc)?.area_id;
}

/** Controllable entity_ids assigned to an area (directly or via their device). */
export function entitiesInArea(hass: Hass, areaId: string): string[] {
  const entities = hass.entities ?? {};
  const result: string[] = [];
  for (const e of Object.values(entities)) {
    if (e.hidden_by) continue;
    if (e.entity_category === "config" || e.entity_category === "diagnostic") continue;
    if (!AREA_DOMAINS.has(domainOf(e.entity_id))) continue;
    const area =
      e.area_id ?? (e.device_id ? hass.devices?.[e.device_id]?.area_id : null);
    if (area !== areaId) continue;
    if (!hass.states[e.entity_id]) continue; // skip not-yet-loaded entities
    result.push(e.entity_id);
  }
  const rank = (id: string) => {
    const i = AREA_DOMAIN_ORDER.indexOf(domainOf(id));
    return i === -1 ? AREA_DOMAIN_ORDER.length : i;
  };
  return result.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The effective devices for a room: explicit list wins, else Area auto-fill. */
export function roomDevices(hass: Hass | undefined, room: RoomConfig): DeviceRef[] {
  if (room.devices?.length) return room.devices;
  if (hass && room.area) {
    const areaId = resolveAreaId(hass, room.area);
    if (areaId) return entitiesInArea(hass, areaId).map((entity_id) => ({ entity_id }));
  }
  return room.devices ?? [];
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
  cmd: "open" | "close" | "stop"
): void {
  hass.callService("cover", `${cmd}_cover`, { entity_id: entityId });
}

/** A short, human display value for read-only entities. */
export function displayState(entity: HassEntity | undefined): string {
  if (!entity) return "—";
  const unit = entity.attributes.unit_of_measurement;
  return unit ? `${entity.state} ${unit}` : entity.state;
}
