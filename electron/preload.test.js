import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// preload.cjs uses require("electron"); put a fake in the require cache before loading it.
function loadPreload() {
  const exposed = {};
  const ipc = { sendSync: vi.fn(() => "v"), send: vi.fn(), invoke: vi.fn(async () => "r"), on: vi.fn() };
  const fake = { contextBridge: { exposeInMainWorld: vi.fn((name, api) => { exposed[name] = api; }) }, ipcRenderer: ipc };
  const id = require.resolve("electron");
  const preload = require.resolve("./preload.cjs");
  const saved = require.cache[id];
  require.cache[id] = { id, filename: id, loaded: true, exports: fake };
  delete require.cache[preload];
  try { require(preload); } finally { if (saved) require.cache[id] = saved; else delete require.cache[id]; }
  return { exposed, ipc, fake };
}

const CONTRACT = ["native", "load", "save", "send", "on", "displays", "onDisplays", "place", "windowed", "toggle", "escape", "exportFile", "importFile"];

describe("preload bridge", () => {
  it("exposes exactly the original window.ldlg contract", () => {
    const { exposed, fake } = loadPreload();
    expect(fake.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(Object.keys(exposed)).toEqual(["ldlg"]);
    expect(Object.keys(exposed.ldlg).sort()).toEqual([...CONTRACT].sort());
    expect(exposed.ldlg.native).toBe(true);
  });

  it("maps each call to the right IPC channel", async () => {
    const { exposed: { ldlg }, ipc } = loadPreload();
    expect(ldlg.load("k")).toBe("v");
    expect(ipc.sendSync).toHaveBeenCalledWith("load", "k");
    ldlg.save("k", 1); expect(ipc.send).toHaveBeenCalledWith("save", "k", 1);
    ldlg.send({ t: 1 }); expect(ipc.send).toHaveBeenCalledWith("bus", { t: 1 });
    ldlg.escape(); expect(ipc.send).toHaveBeenCalledWith("pub-escape");
    await ldlg.displays(); expect(ipc.invoke).toHaveBeenCalledWith("displays");
    await ldlg.place(7); expect(ipc.invoke).toHaveBeenCalledWith("place", 7);
    await ldlg.windowed(); expect(ipc.invoke).toHaveBeenCalledWith("windowed");
    await ldlg.toggle(); expect(ipc.invoke).toHaveBeenCalledWith("toggle");
    await ldlg.exportFile("a.txt", "hi"); expect(ipc.invoke).toHaveBeenCalledWith("export", { name: "a.txt", text: "hi" });
    await ldlg.importFile(); expect(ipc.invoke).toHaveBeenCalledWith("import");
  });

  it("listeners get only the payload, not the IPC event", () => {
    const { exposed: { ldlg }, ipc } = loadPreload();
    const onBus = vi.fn(), onDisplays = vi.fn();
    ldlg.on(onBus);
    ldlg.onDisplays(onDisplays);
    const handler = (ch) => ipc.on.mock.calls.find(([c]) => c === ch)[1];
    handler("bus")({ sender: 1 }, { m: 1 });
    handler("displays")({ sender: 1 }, { on: null });
    expect(onBus).toHaveBeenCalledWith({ m: 1 });
    expect(onDisplays).toHaveBeenCalledWith({ on: null });
  });
});
