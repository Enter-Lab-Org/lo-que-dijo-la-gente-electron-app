import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same policy as the original page. Only injected in the build (the dev server needs a websocket for HMR),
// and prepended to <head> so it applies before the module script and stylesheet tags.
const CSP = "default-src 'none'; img-src 'self' file: data: blob:; style-src 'self' file: 'unsafe-inline'; script-src 'self' file: 'unsafe-inline'; font-src 'self' file:";

const cspPlugin = () => ({
  name: "ldlg-csp",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
});

export default defineConfig({
  base: "./",
  plugins: [react(), cspPlugin()],
  server: { port: 8081, strictPort: true },
  preview: { port: 8081, strictPort: true },
  build: { outDir: "dist", assetsInlineLimit: 0 },
  test: {
    // Two projects: the React app in jsdom, the Electron main/preload helpers in plain Node.
    projects: [
      { extends: true, test: { name: "web", include: ["src/**/*.test.{js,jsx}"], environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.js"], css: false } },
      { extends: true, test: { name: "electron", include: ["electron/**/*.test.js"], environment: "node", globals: true } },
    ],
  },
});
