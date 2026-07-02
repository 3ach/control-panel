import "./control-panel.js";
import { createMockHass } from "./mock-hass.js";
import type { ControlPanel } from "./control-panel.js";

// Dev-only bootstrap: mount <control-panel> and feed it a mock hass that
// updates the element whenever a service is "called".
const el = document.createElement("control-panel") as ControlPanel;
document.getElementById("app")!.appendChild(el);

el.hass = createMockHass((hass) => {
  el.hass = hass; // new object reference -> Lit re-renders
});
