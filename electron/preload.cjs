// Secure bridge between the windows and the app. Only exposes what the game needs.
// Must stay self-contained: sandboxed preloads can only require("electron").
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ldlg", {
  native: true,
  load: (k) => ipcRenderer.sendSync("load", k),
  save: (k, v) => ipcRenderer.send("save", k, v),
  send: (m) => ipcRenderer.send("bus", m),
  on: (fn) => { ipcRenderer.on("bus", (_e, m) => fn(m)); },
  displays: () => ipcRenderer.invoke("displays"),
  onDisplays: (fn) => { ipcRenderer.on("displays", (_e, info) => fn(info)); },
  place: (id) => ipcRenderer.invoke("place", id),
  windowed: () => ipcRenderer.invoke("windowed"),
  toggle: () => ipcRenderer.invoke("toggle"),
  escape: () => ipcRenderer.send("pub-escape"),
  exportFile: (name, text) => ipcRenderer.invoke("export", { name, text }),
  importFile: () => ipcRenderer.invoke("import"),
});
