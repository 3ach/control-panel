import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { RoomConfig, Hass, DeviceRef } from "./types.js";
import {
  domainOf,
  friendlyName,
  isOn,
  isUnavailable,
  toggle,
  setBrightnessPct,
  brightnessPct,
  bumpTemperature,
  coverCommand,
  displayState,
  roomDevices,
} from "./ha-utils.js";

/**
 * <device-panel> — side sheet listing the devices in the selected room,
 * with the right control per entity domain.
 */
@customElement("device-panel")
export class DevicePanel extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @property({ attribute: false }) room?: RoomConfig;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: #221c2e;
      --ink: #221c2e;
      font: 400 14px/1.4 "Trebuchet MS", system-ui, sans-serif;
    }
    .empty {
      flex: 1 1 auto;
      display: grid;
      place-items: center;
      text-align: center;
      color: #8a8276;
      font-weight: 600;
      padding: 24px;
    }
    header {
      flex: 0 0 auto;
      padding: 20px 18px 14px;
      border-bottom: 3px solid var(--ink);
    }
    /* Suppress the tap focus outline on the touch controls. */
    button:focus,
    input:focus {
      outline: none;
    }
    header h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
    }
    header p {
      display: inline-block;
      margin: 8px 0 0;
      padding: 3px 10px;
      background: #ffd23f;
      border: 2px solid var(--ink);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .list {
      flex: 1 1 auto;
      min-height: 0;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }
    .device {
      background: #fff;
      border: 2.5px solid var(--ink);
      border-radius: 14px;
      padding: 13px 15px;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .device.unavailable {
      opacity: 0.45;
      box-shadow: none;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .name {
      font-weight: 800;
    }
    .sub {
      color: #8a8276;
      font-size: 12px;
      font-weight: 600;
    }
    .value {
      font-variant-numeric: tabular-nums;
      color: var(--ink);
    }
    .switch {
      box-sizing: border-box;
      position: relative;
      width: 52px;
      height: 30px;
      border-radius: 999px;
      border: 2.5px solid var(--ink);
      cursor: pointer;
      background: #ece6d8;
      transition: background 160ms ease;
      flex: 0 0 auto;
    }
    .switch[aria-pressed="true"] {
      background: #57cc99;
    }
    .switch::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid var(--ink);
      transform: translateY(-50%);
      transition: transform 160ms ease;
    }
    .switch[aria-pressed="true"]::after {
      transform: translate(20px, -50%);
    }
    input[type="range"] {
      width: 100%;
      margin-top: 12px;
      accent-color: #ff924c;
    }
    .btns {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .btns button,
    .stepper button {
      background: #fff;
      border: 2.5px solid var(--ink);
      color: var(--ink);
      border-radius: 9px;
      padding: 9px 13px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      box-shadow: 2px 2px 0 var(--ink);
    }
    .btns button:active,
    .stepper button:active {
      transform: translate(2px, 2px);
      box-shadow: none;
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .stepper button {
      width: 40px;
      height: 40px;
      font-size: 20px;
      line-height: 1;
    }
    .big {
      font-size: 22px;
      font-weight: 800;
    }
  `;

  private renderDevice(dev: DeviceRef): TemplateResult {
    const hass = this.hass!;
    const entity = hass.states[dev.entity_id];
    const name = dev.name ?? friendlyName(hass, dev.entity_id);
    const domain = domainOf(dev.entity_id);
    const unavailable = isUnavailable(entity);

    if (unavailable) {
      return html`<div class="device unavailable">
        <div class="row">
          <div>
            <div class="name">${name}</div>
            <div class="sub">${dev.entity_id}</div>
          </div>
          <div class="value">unavailable</div>
        </div>
      </div>`;
    }

    if (domain === "light") {
      const on = isOn(entity);
      const pct = brightnessPct(entity);
      const body = on
        ? html`<input
            type="range"
            min="1"
            max="100"
            .value=${String(pct || 100)}
            @change=${(e: Event) =>
              setBrightnessPct(hass, dev.entity_id, +(e.target as HTMLInputElement).value)}
          />`
        : nothing;
      return this.card(name, on ? `${pct || 100}%` : "off", this.toggleBtn(dev.entity_id, on), body);
    }

    if (["switch", "fan", "input_boolean", "media_player"].includes(domain)) {
      const on = isOn(entity);
      return this.card(name, on ? "on" : "off", this.toggleBtn(dev.entity_id, on));
    }

    if (domain === "climate") {
      const target = entity.attributes.temperature ?? "—";
      const current = entity.attributes.current_temperature;
      const body = html`<div class="stepper">
        <button @click=${() => bumpTemperature(hass, dev.entity_id, -0.5)}>−</button>
        <span class="big">${target}°</span>
        <button @click=${() => bumpTemperature(hass, dev.entity_id, +0.5)}>+</button>
      </div>`;
      const sub = current != null ? `now ${current}° · ${entity.state}` : entity.state;
      return this.card(name, sub, nothing, body);
    }

    if (domain === "cover") {
      const body = html`<div class="btns">
        <button @click=${() => coverCommand(hass, dev.entity_id, "open")}>Open</button>
        <button @click=${() => coverCommand(hass, dev.entity_id, "stop")}>Stop</button>
        <button @click=${() => coverCommand(hass, dev.entity_id, "close")}>Close</button>
      </div>`;
      return this.card(name, entity.state, nothing, body);
    }

    // sensor / binary_sensor / everything else: read-only value
    return this.card(
      name,
      dev.entity_id,
      html`<div class="value big">${displayState(entity)}</div>`
    );
  }

  private toggleBtn(entityId: string, on: boolean): TemplateResult {
    return html`<button
      class="switch"
      role="switch"
      aria-pressed=${on ? "true" : "false"}
      aria-label="Toggle"
      @click=${() => toggle(this.hass!, entityId)}
    ></button>`;
  }

  /** Device card: `header` sits on the title row, `body` renders below it. */
  private card(
    name: string,
    sub: string,
    header: TemplateResult | typeof nothing,
    body: TemplateResult | typeof nothing = nothing
  ): TemplateResult {
    return html`<div class="device">
      <div class="row">
        <div>
          <div class="name">${name}</div>
          <div class="sub">${sub}</div>
        </div>
        ${header}
      </div>
      ${body}
    </div>`;
  }

  override render() {
    if (!this.room) {
      return html`<div class="empty">
        <div>
          <div style="font-size:28px;margin-bottom:8px">⌂</div>
          Select a room on the blueprint<br />to manage its devices
        </div>
      </div>`;
    }
    const room = this.room;
    const devices = roomDevices(this.hass, room);
    return html`
      <header>
        <h2>${room.name}</h2>
        <p>${devices.length} device${devices.length === 1 ? "" : "s"}</p>
      </header>
      <div class="list">
        ${devices.length
          ? devices.map((d) => this.renderDevice(d))
          : html`<div class="sub" style="padding:6px 4px">
              No devices found for area “${room.area ?? room.name}”.
            </div>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "device-panel": DevicePanel;
  }
}
