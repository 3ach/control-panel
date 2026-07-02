import { defineConfig } from "vite";

// Two modes:
//  - `vite` (dev)     -> serves index.html with a mock Home Assistant for local design work
//  - `vite build`     -> bundles a single ES module you load into HA as a panel_custom resource
export default defineConfig(({ command }) => ({
  build: {
    lib: {
      entry: "src/control-panel.ts",
      formats: ["es"],
      fileName: () => "control-panel.js",
    },
    rollupOptions: {
      // Keep everything (incl. Lit) in one file so HA can load a single URL.
      output: { inlineDynamicImports: true },
    },
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
  },
  // During dev we want the panel element registered AND the mock harness.
  // The harness imports control-panel.ts itself, so no special config needed.
  server: { port: 5173, open: command === "serve" },
}));
