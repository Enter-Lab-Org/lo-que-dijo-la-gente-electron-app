import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const core = require("./core.cjs");

const display = (id, width = 1920, height = 1080, extra = {}) =>
  ({ id, size: { width, height }, workArea: { x: 0, y: 0, width, height: height - 40 }, label: "", ...extra });

describe("fileFor", () => {
  it("keeps safe keys and adds .json", () => {
    expect(core.fileFor("/d", "ldlg-v2")).toBe(path.join("/d", "ldlg-v2.json"));
    expect(core.fileFor("/d", "ldlg_tab")).toBe(path.join("/d", "ldlg_tab.json"));
  });
  it("replaces anything that could escape the folder", () => {
    expect(core.fileFor("/d", "../../etc/passwd")).toBe(path.join("/d", "______etc_passwd.json"));
    expect(core.fileFor("/d", "a b/c\\d.é")).toBe(path.join("/d", "a_b_c_d__.json"));
  });
  it("stringifies non-string keys", () => {
    expect(core.fileFor("/d", 42)).toBe(path.join("/d", "42.json"));
  });
});

describe("createStore", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ldlg-test-")); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); });

  const read = (k) => JSON.parse(fs.readFileSync(core.fileFor(dir, k), "utf8"));

  it("returns null for unknown keys", () => {
    const s = core.createStore({ dir });
    s.loadAll();
    expect(s.get("nope")).toBeNull();
  });

  it("loads existing .json files and skips broken or foreign ones", () => {
    fs.writeFileSync(path.join(dir, "ldlg-v2.json"), JSON.stringify({ rev: 3 }));
    fs.writeFileSync(path.join(dir, "broken.json"), "{oops");
    fs.writeFileSync(path.join(dir, "notes.txt"), "hi");
    const log = vi.fn();
    const s = core.createStore({ dir, log });
    s.loadAll();
    expect(s.get("ldlg-v2")).toEqual({ rev: 3 });
    expect(s.get("broken")).toBeNull();
    expect(s.get("notes")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("creates the data folder when missing", () => {
    const sub = path.join(dir, "datos");
    core.createStore({ dir: sub }).loadAll();
    expect(fs.existsSync(sub)).toBe(true);
  });

  it("debounces writes: only the last value hits the disk after the delay", () => {
    const s = core.createStore({ dir, delay: 400 });
    s.loadAll();
    s.save("k", 1);
    s.save("k", 2);
    expect(s.get("k")).toBe(2);
    vi.advanceTimersByTime(399);
    expect(fs.existsSync(core.fileFor(dir, "k"))).toBe(false);
    vi.advanceTimersByTime(1);
    expect(read("k")).toBe(2);
    expect(fs.existsSync(core.fileFor(dir, "k") + ".tmp")).toBe(false);
  });

  it("flush writes pending keys right away and cancels their timers", () => {
    const s = core.createStore({ dir });
    s.loadAll();
    s.save("a", { x: 1 });
    s.save("b", [1, 2]);
    s.flush();
    expect(read("a")).toEqual({ x: 1 });
    expect(read("b")).toEqual([1, 2]);
    fs.rmSync(core.fileFor(dir, "a"));
    vi.advanceTimersByTime(1000);
    expect(fs.existsSync(core.fileFor(dir, "a"))).toBe(false);
  });

  it("a fresh store reads back what was saved", () => {
    const s = core.createStore({ dir });
    s.loadAll();
    s.save("ldlg-banco", [{ q: "¿Qué?" }]);
    s.flush();
    const again = core.createStore({ dir });
    again.loadAll();
    expect(again.get("ldlg-banco")).toEqual([{ q: "¿Qué?" }]);
  });

  it("logs and survives write errors", () => {
    const log = vi.fn();
    const s = core.createStore({ dir: path.join(dir, "missing", "deep"), log });
    s.save("k", 1);
    expect(() => s.flush()).not.toThrow();
    expect(log).toHaveBeenCalled();
  });
});

describe("displays", () => {
  const prim = display(1);
  const ext = display(2, 1280, 720, { label: "Proyector" });

  it("displayList numbers displays and marks the primary", () => {
    expect(core.displayList([prim, ext], prim)).toEqual([
      { id: 1, n: 1, w: 1920, h: 1080, primary: true, label: "" },
      { id: 2, n: 2, w: 1280, h: 720, primary: false, label: "Proyector" },
    ]);
  });

  it("externalDisplay picks the first non-primary display, or null", () => {
    expect(core.externalDisplay([prim, ext], prim)).toBe(ext);
    expect(core.externalDisplay([ext, prim], prim)).toBe(ext);
    expect(core.externalDisplay([prim], prim)).toBeNull();
  });

  it("pubInfo has the shape the console expects", () => {
    const win = { isDestroyed: () => false, isVisible: () => true };
    const info = core.pubInfo({ displays: [prim, ext], primary: prim, win, on: 2, isFs: () => true });
    expect(Object.keys(info).sort()).toEqual(["displays", "fullscreen", "on", "visible"]);
    expect(info).toMatchObject({ on: 2, visible: true, fullscreen: true });
    expect(info.displays).toHaveLength(2);
  });

  it("pubInfo reports hidden and windowed when the window is gone", () => {
    const isFs = vi.fn(() => true);
    for (const win of [null, { isDestroyed: () => true, isVisible: () => true }]) {
      expect(core.pubInfo({ displays: [prim], primary: prim, win, on: null, isFs }))
        .toMatchObject({ on: null, visible: false, fullscreen: false });
    }
    expect(isFs).not.toHaveBeenCalled();
  });
});

describe("window bounds", () => {
  it("placedBounds leaves a 40px margin and caps at 1280x720", () => {
    expect(core.placedBounds({ x: 1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: 1960, y: 40, width: 1280, height: 720 });
    expect(core.placedBounds({ x: 0, y: 0, width: 800, height: 600 })).toEqual({ x: 40, y: 40, width: 720, height: 520 });
  });
  it("windowedBounds is 16:9, half width up to 960, top right corner", () => {
    expect(core.windowedBounds({ x: 0, y: 0, width: 2560, height: 1400 })).toEqual({ x: 1576, y: 24, width: 960, height: 540 });
    expect(core.windowedBounds({ x: 0, y: 30, width: 1366, height: 728 })).toEqual({ x: 659, y: 54, width: 683, height: 384 });
  });
});

describe("navigationAllowed", () => {
  it("blocks every navigation in production", () => {
    expect(core.navigationAllowed("https://example.com", null)).toBe(false);
    expect(core.navigationAllowed("file:///etc/passwd", "")).toBe(false);
  });
  it("in dev only allows the dev server origin", () => {
    const dev = "http://localhost:8081";
    expect(core.navigationAllowed("http://localhost:8081/#publico", dev)).toBe(true);
    expect(core.navigationAllowed("http://localhost:8081/src/main.jsx", dev)).toBe(true);
    expect(core.navigationAllowed("http://localhost:9999/", dev)).toBe(false);
    expect(core.navigationAllowed("https://evil.test/", dev)).toBe(false);
    expect(core.navigationAllowed("not a url", dev)).toBe(false);
  });
});

describe("exportFilter", () => {
  it("names text and backup files like the original", () => {
    expect(core.exportFilter("preguntas.txt")).toEqual({ name: "Texto", extensions: ["txt"] });
    expect(core.exportFilter("respaldo.json")).toEqual({ name: "Respaldo", extensions: ["json"] });
  });
});
