import type { Hass, HassEntity, HassAreaEntry, HassEntityEntry, HassDeviceEntry } from "./types.js";

// A throwaway Home Assistant stand-in for local design work. It holds entity
// state + a fake area registry in memory and implements just enough of
// callService to make the controls visibly do something. Never shipped to HA.

type Listener = (hass: Hass) => void;

interface Seed {
  entity_id: string;
  state: string;
  area: string; // area display name; used to build the fake registry
  attributes?: HassEntity["attributes"];
  device?: string; // parent device display name (for multi-sensor grouping)
}

const seed = (
  entity_id: string,
  state: string,
  area: string,
  attributes: HassEntity["attributes"] = {},
  device?: string
): Seed => ({ entity_id, state, area, attributes, device });

// Seeds for the bundled DEMO layout (src/config.ts). Area names must match the
// demo rooms' `area` fields so `npm run dev` shows populated rooms.
const SEED: Seed[] = [
  // ---- Main floor ----
  seed("light.living_room", "on", "Living Room", { friendly_name: "Living Room Ceiling", brightness: 200 }),
  seed("light.living_lamp", "off", "Living Room", { friendly_name: "Floor Lamp", brightness: 0 }),
  seed("switch.tv", "off", "Living Room", { friendly_name: "TV" }),
  seed("media_player.living_room", "playing", "Living Room", { friendly_name: "Living Room Sonos" }),
  seed("sensor.living_temperature", "20.4", "Living Room", {
    friendly_name: "Living Temp",
    unit_of_measurement: "°C",
  }),
  seed("light.kitchen", "on", "Kitchen", { friendly_name: "Kitchen", brightness: 255 }),
  seed("switch.coffee_machine", "on", "Kitchen", { friendly_name: "Coffee Machine" }),
  seed("switch.dishwasher", "off", "Kitchen", { friendly_name: "Dishwasher" }),
  seed("light.bedroom", "off", "Bedroom", { friendly_name: "Bedroom", brightness: 0 }),
  seed("cover.bedroom_blinds", "closed", "Bedroom", {
    friendly_name: "Bedroom Blinds",
    current_position: 0,
    supported_features: 7, // OPEN | CLOSE | SET_POSITION
  }),
  seed("climate.bedroom", "heat", "Bedroom", {
    friendly_name: "Bedroom",
    temperature: 21,
    current_temperature: 20.6,
  }),
  // Multi-sensor ambient sensor -> one combined "environment" card.
  seed("sensor.bedroom_ambient_temperature", "68.4", "Bedroom", { friendly_name: "Bedroom Ambient Temperature", device_class: "temperature", unit_of_measurement: "°F" }, "Bedroom Ambient"),
  seed("sensor.bedroom_ambient_humidity", "41", "Bedroom", { friendly_name: "Bedroom Ambient Humidity", device_class: "humidity", unit_of_measurement: "%" }, "Bedroom Ambient"),
  seed("sensor.bedroom_ambient_pressure", "14.53", "Bedroom", { friendly_name: "Bedroom Ambient Pressure", device_class: "pressure", unit_of_measurement: "psi" }, "Bedroom Ambient"),
  seed("light.bathroom", "off", "Bathroom", { friendly_name: "Bathroom Vanity" }),
  seed("switch.bathroom_fan", "off", "Bathroom", { friendly_name: "Bathroom Fan" }),

  // ---- Upstairs ----
  seed("light.office", "on", "Office", { friendly_name: "Office", brightness: 170 }),
  seed("switch.desk_lamp", "on", "Office", { friendly_name: "Desk Lamp" }),
  seed("media_player.office", "paused", "Office", { friendly_name: "Office Speaker" }),
  // Multi-sensor smart outlet -> one combined "power monitor" card.
  seed("sensor.office_outlet_power", "142.7", "Office", { friendly_name: "Office Outlet Power", device_class: "power", unit_of_measurement: "W" }, "Office Outlet"),
  seed("sensor.office_outlet_demand", "138.2", "Office", { friendly_name: "Office Outlet Instantaneous Demand", device_class: "power", unit_of_measurement: "W" }, "Office Outlet"),
  seed("sensor.office_outlet_voltage", "121.9", "Office", { friendly_name: "Office Outlet Voltage", device_class: "voltage", unit_of_measurement: "V" }, "Office Outlet"),
  seed("sensor.office_outlet_current", "1.17", "Office", { friendly_name: "Office Outlet Current", device_class: "current", unit_of_measurement: "A" }, "Office Outlet"),
  seed("sensor.office_outlet_frequency", "60.02", "Office", { friendly_name: "Office Outlet Frequency", device_class: "frequency", unit_of_measurement: "Hz" }, "Office Outlet"),
  seed("sensor.office_outlet_power_factor", "87", "Office", { friendly_name: "Office Outlet Power Factor", device_class: "power_factor", unit_of_measurement: "%" }, "Office Outlet"),
  seed("sensor.office_outlet_energy", "193044.74", "Office", { friendly_name: "Office Outlet Summation Delivered", device_class: "energy", unit_of_measurement: "Wh" }, "Office Outlet"),
  seed("light.guest_room", "off", "Guest Room", { friendly_name: "Guest Room" }),
  seed("cover.guest_blinds", "open", "Guest Room", {
    friendly_name: "Guest Blinds",
    current_position: 100,
    supported_features: 7,
  }),
  seed("light.upstairs_bath", "off", "Upstairs Bath", { friendly_name: "Upstairs Bath" }),
  seed("switch.upstairs_bath_fan", "off", "Upstairs Bath", { friendly_name: "Upstairs Bath Fan" }),
  seed("binary_sensor.upstairs_leak", "off", "Upstairs Bath", { friendly_name: "Leak Sensor" }),
];

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function createMockHass(onUpdate: Listener): Hass {
  const states: Record<string, HassEntity> = {};
  const areas: Record<string, HassAreaEntry> = {};
  const entities: Record<string, HassEntityEntry> = {};
  const devices: Record<string, HassDeviceEntry> = {};

  for (const s of SEED) {
    states[s.entity_id] = {
      entity_id: s.entity_id,
      state: s.state,
      attributes: s.attributes ?? {},
    };
    const areaId = slug(s.area);
    areas[areaId] ??= { area_id: areaId, name: s.area };
    const deviceId = s.device ? slug(s.device) : undefined;
    if (s.device && deviceId)
      devices[deviceId] ??= { id: deviceId, area_id: areaId, name: s.device };
    entities[s.entity_id] = { entity_id: s.entity_id, area_id: areaId, device_id: deviceId };
  }

  function patch(entity_id: string, next: Partial<HassEntity>) {
    const prev = states[entity_id];
    if (!prev) return;
    states[entity_id] = {
      ...prev,
      ...next,
      attributes: { ...prev.attributes, ...next.attributes },
    };
  }

  function emit() {
    // Real HA replaces the whole hass object each tick; mimic that so Lit's
    // @property change detection fires.
    onUpdate(buildHass());
  }

  function buildHass(): Hass {
    return {
      states: { ...states },
      areas,
      entities,
      devices,
      async callService(_domain, service, data = {}) {
        const ids = ([] as string[]).concat(data.entity_id ?? []);
        for (const id of ids) {
          const cur = states[id];
          if (!cur) continue;
          if (service === "toggle") patch(id, { state: cur.state === "on" ? "off" : "on" });
          else if (service === "turn_on") {
            const attrs: HassEntity["attributes"] = {};
            if (data.brightness_pct != null)
              attrs.brightness = Math.round((data.brightness_pct / 100) * 255);
            patch(id, { state: "on", attributes: attrs });
          } else if (service === "turn_off") patch(id, { state: "off" });
          else if (service === "set_temperature")
            patch(id, { attributes: { temperature: data.temperature } });
          else if (service === "open_cover")
            patch(id, { state: "open", attributes: { current_position: 100 } });
          else if (service === "close_cover")
            patch(id, { state: "closed", attributes: { current_position: 0 } });
          else if (service === "set_cover_position")
            patch(id, {
              state: data.position > 0 ? "open" : "closed",
              attributes: { current_position: data.position },
            });
        }
        emit();
        return undefined;
      },
    };
  }

  return buildHass();
}
