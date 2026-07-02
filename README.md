# Control Panel

An isometric, Memphis-styled floor-plan dashboard for Home Assistant. Tap a
room on the blueprint to manage its devices. Runs as a full-page custom panel
inside HA, so it uses your existing login and the live `hass` object.

## Develop locally

```bash
npm install
npm run dev        # http://localhost:5173, runs against a built-in mock HA
```

The mock HA (`src/mock-hass.ts`) ships fake rooms/areas/devices so you can
design without touching your real instance. `npm run dev` renders the bundled
demo layout (`src/config.ts`) against it.

## How rooms & devices are configured

Your real floor plan does **not** live in this repo. It's supplied at runtime by
Home Assistant through the `panel_custom` `config:` block — keep it in a private
YAML on your HA instance (see [Install](#install-into-home-assistant-via-hacs--ota-updates)).
`src/config.ts` is only a generic **demo** used for local dev and as a fallback
when no layout is provided. The format is the same either way; see
[`control-panel-floorplan.example.yaml`](control-panel-floorplan.example.yaml).

Each room is:

- A rectangle on a grid measured in **feet** (`x, y, w, d`). `x` runs
  left→right on the blueprint, `y` runs top→bottom.
- `level` puts a room on a floor; the top-bar switch toggles floors (omit
  `levels` entirely for a single-floor home).
- `notch: { w, d }` carves an L-shape out of the front-right corner (used so
  the basement **Bar** tucks into the **Living Room**).
- `color` is the room's flat fill (a darker shade is auto-computed for walls).

### Mapping devices — by HA Area

Each room has an **`area`** that points at a Home Assistant Area, by `area_id`
**or** display name (case-insensitive). The panel pulls that area's
controllable entities automatically (lights, switches, climate, covers, fans,
media players, locks, plus sensors), skipping hidden / config / diagnostic
entities. Add or move a device in HA and the panel follows — no code change.

> Make the `area` strings match your Areas in **Settings → Areas, Labels & Zones**.

To hand-pick instead of auto-filling a room, add an explicit list (it overrides
the area):

```yaml
- id: kitchen
  name: Kitchen
  level: main
  area: Kitchen
  devices:
    - entity_id: light.kitchen
      name: Downlights
    - entity_id: switch.coffee_machine
```

## Install into Home Assistant (via HACS — OTA updates)

This is the recommended path: HACS pulls the built bundle from this repo's
GitHub Releases and shows an in-HA update badge whenever you cut a new release.
HAOS never builds anything.

**One-time setup:**

1. **Install HACS** if you don't have it (<https://hacs.xyz/docs/use/download/download/>),
   then restart HA and complete the GitHub device-login it prompts for.
2. **Add this repo as a custom repository.** In HA: *HACS → ⋮ (top right) →
   Custom repositories*. Paste the repo URL, set **Type: Dashboard** (a.k.a.
   Lovelace plugin), and add. Then open it and click **Download**.
   - HACS drops the file at `config/www/community/control-panel/control-panel.js`,
     served at `/hacsfiles/control-panel/control-panel.js`.
3. **Add your floor plan.** Copy
   [`control-panel-floorplan.example.yaml`](control-panel-floorplan.example.yaml)
   into your HA config dir as `control-panel-floorplan.yaml` and edit it to match
   your home. This file stays on your instance — it never goes in the repo.
4. **Register the panel** in `configuration.yaml`, pointing it at that layout via
   `!include`:

   ```yaml
   panel_custom:
     - name: control-panel            # must match the custom element tag
       url_path: home                 # sidebar route -> /home
       sidebar_title: Home
       sidebar_icon: mdi:floor-plan
       module_url: /hacsfiles/control-panel/control-panel.js
       config: !include control-panel-floorplan.yaml
   ```

   (Without `config:`, the panel falls back to the bundled demo layout.)
5. **Restart Home Assistant** once. The panel appears in the sidebar.

**Updating:**

- **Your layout** lives in `control-panel-floorplan.yaml` on HA. Edit it there,
  then reload the panel (a browser refresh; changing `panel_custom` structure
  needs an HA restart, but editing the included layout usually just needs a
  refresh).
- **The panel code** updates over the air: run `npm run release` here (bumps the
  version, tags, pushes; CI builds + attaches the bundle). In HA, HACS shows an
  update for Control Panel (or *HACS → ⋮ → Reload* to check now) — click
  **Update**, then hard-refresh (Ctrl/Cmd-Shift-R).

## Deploy manually (no HACS)

1. **Build & copy** the single-file bundle into HA's `www` folder:

   ```bash
   HA_WWW=/path/to/homeassistant/config/www npm run deploy
   ```

   (or `npm run build` then copy `dist/control-panel.js` to
   `<HA config>/www/control-panel/control-panel.js` yourself). HA serves it at
   `/local/control-panel/control-panel.js`. Point `module_url` there and add a
   `?v=N` cache-buster you bump on each copy.
