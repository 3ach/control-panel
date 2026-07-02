import { LitElement, html, svg, css, nothing, type SVGTemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { FloorplanConfig, RoomConfig, Hass } from "./types.js";
import { roomGeometry, poly, project } from "./iso.js";
import { isOn, roomDevices } from "./ha-utils.js";

/**
 * <iso-floorplan> — renders the home as a clickable isometric blueprint.
 * Emits `room-select` (detail: { roomId }) when a room floor is clicked.
 */
@customElement("iso-floorplan")
export class IsoFloorplan extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @property({ attribute: false }) config!: FloorplanConfig;
  @property() selected = "";

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --ink: #221c2e;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
      user-select: none;
      touch-action: manipulation;
    }
    .room {
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: transform 160ms ease;
    }
    .room.selected {
      transform: translateY(-14px);
    }
    .floor,
    .wall {
      stroke: var(--ink);
      stroke-linejoin: round;
      transition: stroke-width 160ms ease;
    }
    .floor {
      stroke-width: 2.5;
    }
    .wall {
      stroke-width: 2.5;
      pointer-events: none;
    }
    .label {
      pointer-events: none;
      fill: var(--ink);
      font: 800 13px/1 "Trebuchet MS", system-ui, sans-serif;
      letter-spacing: 0.2px;
      text-anchor: middle;
      paint-order: stroke;
      stroke: rgba(255, 255, 255, 0.85);
      stroke-width: 3.5px;
    }
    .count {
      pointer-events: none;
      fill: var(--ink);
      opacity: 0.7;
      font: 700 10px/1 "Trebuchet MS", system-ui, sans-serif;
      text-anchor: middle;
      paint-order: stroke;
      stroke: rgba(255, 255, 255, 0.8);
      stroke-width: 3px;
    }
  `;

  /** Multiply each RGB channel toward black by `amt` (0..1). */
  private shade(hex: string, amt: number): string {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!m) return hex;
    const ch = (i: number) =>
      Math.round(parseInt(m[i], 16) * (1 - amt))
        .toString(16)
        .padStart(2, "0");
    return `#${ch(1)}${ch(2)}${ch(3)}`;
  }

  /** Painter's order: draw back-to-front so near rooms overlap far ones.
   *
   * A simple `x + y` (back-corner) sort misorders edge-adjacent rooms of
   * different sizes — e.g. a small room west of a taller neighbor whose back
   * corner happens to sit further back. Instead we topologically sort the true
   * occlusion relation: room A is *behind* B (draw A first) when A lies
   * entirely west or entirely north of B in the grid. */
  private orderedRooms(): RoomConfig[] {
    const rooms = [...this.config.rooms];
    const n = rooms.length;
    const isBehind = (a: RoomConfig, b: RoomConfig): boolean =>
      a.x + a.w <= b.x || a.y + a.d <= b.y;

    const indeg = new Array(n).fill(0);
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        // Skip the ambiguous diagonal (both "behind" each other) to avoid cycles.
        if (isBehind(rooms[i], rooms[j]) && !isBehind(rooms[j], rooms[i])) {
          adj[i].push(j);
          indeg[j]++;
        }
      }
    }

    // Kahn's algorithm; among ready rooms take the back-most for a stable order.
    const backSum = (i: number) => rooms[i].x + rooms[i].y;
    const done = new Array(n).fill(false);
    const out: RoomConfig[] = [];
    for (let k = 0; k < n; k++) {
      const ready = rooms
        .map((_, i) => i)
        .filter((i) => !done[i] && indeg[i] === 0)
        .sort((a, b) => backSum(a) - backSum(b) || a - b);
      if (!ready.length) break; // cycle guard (shouldn't happen for a real plan)
      const i = ready[0];
      done[i] = true;
      indeg[i] = -1;
      out.push(rooms[i]);
      for (const j of adj[i]) indeg[j]--;
    }
    // Append any leftovers from a cycle, back-most first.
    if (out.length < n) {
      for (const i of rooms
        .map((_, i) => i)
        .filter((i) => !done[i])
        .sort((a, b) => backSum(a) - backSum(b))) {
        out.push(rooms[i]);
      }
    }
    return out;
  }

  private viewBox(): string {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of this.config.rooms) {
      const h = r.height ?? 4;
      const g = roomGeometry(r.x, r.y, r.w, r.d, h, r.notch);
      for (const p of [...g.floor, ...g.walls.flatMap((wall) => wall.pts)]) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    const pad = 60;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad - 20; // extra top room for labels
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return `${minX} ${minY} ${w} ${h}`;
  }

  private renderRoom(room: RoomConfig): SVGTemplateResult {
    const h = room.height ?? 4;
    const g = roomGeometry(room.x, room.y, room.w, room.d, h, room.notch);
    const accent = room.color ?? "#3fb6ff";
    const selected = this.selected === room.id;
    const devices = roomDevices(this.hass, room);
    const onCount = devices.filter((d) => isOn(this.hass?.states[d.entity_id])).length;
    const labelPt = project(room.x + room.w / 2, room.y + room.d / 2, h);

    return svg`
      <g
        class="room ${selected ? "selected" : ""}"
        @click=${(e: Event) => {
          e.stopPropagation(); // don't let the background handler deselect
          this.select(room.id);
        }}
        role="button"
        tabindex="0"
        aria-label=${room.name}
        @keydown=${(e: KeyboardEvent) =>
          (e.key === "Enter" || e.key === " ") && this.select(room.id)}
      >
        ${g.walls.map(
          (wall) =>
            svg`<polygon class="wall" points=${poly(wall.pts)}
              fill=${this.shade(accent, wall.face === "left" ? 0.34 : 0.18)} />`
        )}
        <polygon class="floor" points=${poly(g.floor)} fill=${accent} />
        <text class="label" x=${labelPt.x} y=${labelPt.y - 6}>${room.name}</text>
        <text class="count" x=${labelPt.x} y=${labelPt.y + 10}>
          ${onCount > 0 ? `${onCount} on` : `${devices.length} devices`}
        </text>
      </g>
    `;
  }

  private select(roomId: string): void {
    this.dispatchEvent(
      new CustomEvent("room-select", {
        detail: { roomId },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    if (!this.config) return nothing;
    return html`
      <svg
        viewBox=${this.viewBox()}
        preserveAspectRatio="xMidYMid meet"
        @click=${() => this.select("")}
      >
        ${this.orderedRooms().map((r) => this.renderRoom(r))}
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "iso-floorplan": IsoFloorplan;
  }
}
