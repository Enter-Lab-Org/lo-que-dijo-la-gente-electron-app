// Pure helpers for the main process. No Electron imports, so they can be unit tested in Node.
const path = require("path");
const nodeFs = require("fs");

const fileFor = (dir, k) => path.join(dir, String(k).replace(/[^a-z0-9_-]/gi, "_") + ".json");

// In-memory cache with debounced, atomic (tmp + rename) JSON writes, one file per key.
function createStore({ dir, fs = nodeFs, delay = 400, log = console.error }) {
  const cache = {};
  const timers = {};

  function loadAll() {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try { cache[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
      catch (e) { log("No se pudo leer", f, e); }
    }
  }
  function writeNow(k) {
    const f = fileFor(dir, k), tmp = f + ".tmp";
    try { fs.writeFileSync(tmp, JSON.stringify(cache[k])); fs.renameSync(tmp, f); }
    catch (e) { log("No se pudo guardar", k, e); }
  }
  const get = (k) => (cache[k] === undefined ? null : cache[k]);
  function save(k, v) {
    cache[k] = v;
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => { delete timers[k]; writeNow(k); }, delay);
  }
  function flush() {
    for (const k of Object.keys(timers)) { clearTimeout(timers[k]); delete timers[k]; writeNow(k); }
  }
  return { loadAll, get, save, flush, writeNow };
}

const displayList = (displays, primary) => displays.map((d, i) => ({
  id: d.id, n: i + 1, w: d.size.width, h: d.size.height, primary: d.id === primary.id, label: d.label || "",
}));

const externalDisplay = (displays, primary) => displays.find((d) => d.id !== primary.id) || null;

function pubInfo({ displays, primary, win, on, isFs }) {
  const alive = !!win && !win.isDestroyed();
  return { displays: displayList(displays, primary), on, visible: alive && win.isVisible(), fullscreen: alive && !!isFs(win) };
}

// Window bounds before going fullscreen on a display.
const placedBounds = (b) => ({ x: b.x + 40, y: b.y + 40, width: Math.min(1280, b.width - 80), height: Math.min(720, b.height - 80) });

// Normal 16:9 window in the top right corner of the primary display.
function windowedBounds(a) {
  const width = Math.min(960, Math.round(a.width * 0.5)), height = Math.round(width * 9 / 16);
  return { x: a.x + a.width - width - 24, y: a.y + 24, width, height };
}

// Production blocks all navigation. Dev only allows the Vite server origin (HMR full reloads).
function navigationAllowed(url, devUrl) {
  if (!devUrl) return false;
  try { return new URL(url).origin === new URL(devUrl).origin; } catch { return false; }
}

const exportFilter = (name) => ({ name: name.endsWith(".txt") ? "Texto" : "Respaldo", extensions: [name.split(".").pop()] });

module.exports = { fileFor, createStore, displayList, externalDisplay, pubInfo, placedBounds, windowedBounds, navigationAllowed, exportFilter };
