import type { Hass, HassEntity, HassAreaEntry, HassEntityEntry } from "./types.js";

// A throwaway Home Assistant stand-in for local design work. It holds entity
// state + a fake area registry in memory and implements just enough of
// callService to make the controls visibly do something. Never shipped to HA.

type Listener = (hass: Hass) => void;

interface Seed {
  entity_id: string;
  state: string;
  area: string; // area display name; used to build the fake registry
  attributes?: HassEntity["attributes"];
}

const seed = (
  entity_id: string,
  state: string,
  area: string,
  attributes: HassEntity["attributes"] = {}
): Seed => ({ entity_id, state, area, attributes });

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
  seed("light.bathroom", "off", "Bathroom", { friendly_name: "Bathroom Vanity" }),
  seed("switch.bathroom_fan", "off", "Bathroom", { friendly_name: "Bathroom Fan" }),

  // ---- Upstairs ----
  seed("light.office", "on", "Office", { friendly_name: "Office", brightness: 170 }),
  seed("switch.desk_lamp", "on", "Office", { friendly_name: "Desk Lamp" }),
  seed("media_player.office", "paused", "Office", { friendly_name: "Office Speaker" }),
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

  for (const s of SEED) {
    states[s.entity_id] = {
      entity_id: s.entity_id,
      state: s.state,
      attributes: s.attributes ?? {},
    };
    const areaId = slug(s.area);
    areas[areaId] ??= { area_id: areaId, name: s.area };
    entities[s.entity_id] = { entity_id: s.entity_id, area_id: areaId };
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
      devices: {},
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
