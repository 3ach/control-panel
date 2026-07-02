import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Hass, FloorplanConfig } from "./types.js";
import { FLOORPLAN } from "./config.js";
import { DEFAULT_HIDE_LABELS } from "./ha-utils.js";
import "./iso-floorplan.js";
import "./device-panel.js";

/**
 * <control-panel> — the element Home Assistant mounts as a custom panel.
 *
 * HA sets these properties on the element:
 *   - hass   : live Home Assistant connection/state (replaced on every update)
 *   - narrow : true on small screens
 *   - panel  : { config } from the panel_custom YAML
 *
 * The floorplan config comes from `panel.config.floorplan` if present,
 * otherwise the bundled default in config.ts.
 */
@customElement("control-panel")
export class ControlPanel extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @property({ attribute: false }) narrow = false;
  @property({ attribute: false }) panel?: { config?: { floorplan?: FloorplanConfig } };

  @state() private selectedRoomId = "";
  @state() private activeLevel = "";

  private get config(): FloorplanConfig {
    return this.panel?.config?.floorplan ?? FLOORPLAN;
  }

  /** Levels from config, or a single implicit level if none declared. */
  private get levels(): { id: string; name: string }[] {
    return this.config.levels ?? [];
  }

  /** The currently shown level id (defaults to the first declared level). */
  private get level(): string {
    return this.activeLevel || this.levels[0]?.id || "";
  }

  /** Config narrowed to the rooms on the active level. */
  private get levelConfig(): FloorplanConfig {
    if (!this.levels.length) return this.config;
    return { ...this.config, rooms: this.config.rooms.filter((r) => r.level === this.level) };
  }

  private selectLevel(id: string) {
    this.activeLevel = id;
    // Drop the selection if that room isn't on the new floor.
    const room = this.config.rooms.find((r) => r.id === this.selectedRoomId);
    if (room && room.level !== id) this.selectedRoomId = "";
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      color: #221c2e;
      --panel-w: 360px;
      --ink: #221c2e;
      --cream: #f7f1e3;
    }
    .app {
      display: grid;
      grid-template-columns: 1fr var(--panel-w);
      grid-template-rows: auto 1fr;
      grid-template-areas: "top top" "stage panel";
      height: 100%;
      background: var(--cream);
    }
    .topbar {
      grid-area: top;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 22px;
      background: #fffdf7;
      border-bottom: 3px solid var(--ink);
    }
    .topbar h1 {
      margin: 0;
      font: 800 20px/1 "Trebuchet MS", system-ui, sans-serif;
      letter-spacing: 0.3px;
    }
    .topbar .spacer {
      flex: 1;
    }
    .topbar .hint {
      color: #8a8276;
      font-size: 12px;
      font-weight: 600;
    }
    .levels {
      display: flex;
      gap: 6px;
      padding: 5px;
      background: var(--cream);
      border: 2.5px solid var(--ink);
      border-radius: 12px;
    }
    .levels button {
      -webkit-tap-highlight-color: transparent;
      appearance: none;
      border: 2.5px solid transparent;
      background: transparent;
      color: var(--ink);
      font: 800 14px/1 "Trebuchet MS", system-ui, sans-serif;
      padding: 9px 18px;
      border-radius: 8px;
      cursor: pointer;
    }
    .levels button.active {
      background: #ffd23f;
      border-color: var(--ink);
      box-shadow: 2px 2px 0 var(--ink);
    }
    .stage {
      grid-area: stage;
      position: relative;
      min-height: 0;
      background-color: var(--cream);
    }
    .panel {
      grid-area: panel;
      min-height: 0;
      background: #fffdf7;
      border-left: 3px solid var(--ink);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Narrow / mobile: panel becomes a bottom sheet. */
    :host([narrow]) .app,
    .app.narrow {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto;
      grid-template-areas: "top" "stage" "panel";
      --panel-w: 100%;
    }
    .app.narrow .panel {
      border-left: none;
      border-top: 3px solid var(--ink);
      max-height: 45%;
    }
  `;

  private onRoomSelect(e: CustomEvent<{ roomId: string }>) {
    // Tapping the active room (or empty background) closes the panel.
    this.selectedRoomId =
      e.detail.roomId === this.selectedRoomId ? "" : e.detail.roomId;
  }

  override render() {
    const room = this.config.rooms.find((r) => r.id === this.selectedRoomId);
    return html`
      <div class="app ${this.narrow ? "narrow" : ""}" @room-select=${this.onRoomSelect}>
        <div class="topbar">
          <h1>${this.config.title ?? "Control Panel"}</h1>
          <span class="spacer"></span>
          ${this.levels.length > 1
            ? html`<div class="levels">
                ${this.levels.map(
                  (l) => html`<button
                    class=${l.id === this.level ? "active" : ""}
                    @click=${() => this.selectLevel(l.id)}
                  >
                    ${l.name}
                  </button>`
                )}
              </div>`
            : html`<span class="hint">${this.hass ? "Connected" : "No connection"}</span>`}
        </div>
        <div class="stage">
          <iso-floorplan
            .hass=${this.hass}
            .config=${this.levelConfig}
            .selected=${this.selectedRoomId}
          ></iso-floorplan>
        </div>
        <div class="panel">
          <device-panel
            .hass=${this.hass}
            .room=${room}
            .excludeLabels=${this.config.excludeLabels ?? DEFAULT_HIDE_LABELS}
          ></device-panel>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "control-panel": ControlPanel;
  }
}
