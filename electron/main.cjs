// Lo Que Dijo la Gente — desktop app (Windows, Mac, Linux), works offline.
// Opens two windows: the CONSOLE on your screen and the PUBLIC view on the projector.

const { app, BrowserWindow, ipcMain, screen, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const core = require("./core.cjs");

// Lets the public screen play sounds without being clicked first.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const isMac = process.platform === "darwin";
const INDEX = path.join(__dirname, "..", "dist", "index.html");
const PRELOAD = path.join(__dirname, "preload.cjs");
// Dev only: load the Vite dev server instead of the built files (never in a packaged app).
const DEV_URL = !app.isPackaged && process.env.ELECTRON_DEV_URL ? process.env.ELECTRON_DEV_URL : null;

let ctlWin = null;
let pubWin = null;
let pubDisplayId = null; // display where the public view is fullscreen (null = windowed)
let quitting = false;

/* ------------------------------------------------------------------
   Data on disk (app data folder)
   Windows: %APPDATA%\Lo Que Dijo la Gente\datos
   Mac:     ~/Library/Application Support/Lo Que Dijo la Gente/datos
   Linux:   ~/.config/Lo Que Dijo la Gente/datos
   ------------------------------------------------------------------ */
let store = null;

ipcMain.on("load", (e, k) => { e.returnValue = store ? store.get(k) : null; });
ipcMain.on("save", (_e, k, v) => store && store.save(k, v));

// Messages between windows: whatever one sends is relayed to the other.
ipcMain.on("bus", (e, m) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents !== e.sender) w.webContents.send("bus", m);
  }
});

/* ------------------------------------------------------------------
   Displays and projector
   ------------------------------------------------------------------ */
const isFs = (w) => (isMac ? w.isSimpleFullScreen() || w.isFullScreen() : w.isFullScreen());
const setFs = (w, on) => (isMac ? w.setSimpleFullScreen(on) : w.setFullScreen(on));

const pubInfo = () => core.pubInfo({
  displays: screen.getAllDisplays(), primary: screen.getPrimaryDisplay(), win: pubWin, on: pubDisplayId, isFs,
});
function notify() {
  if (ctlWin && !ctlWin.isDestroyed()) ctlWin.webContents.send("displays", pubInfo());
}
const externalDisplay = () => core.externalDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay());

function loadPage(win, hash) {
  if (DEV_URL) win.loadURL(hash ? DEV_URL + "#" + hash : DEV_URL);
  else win.loadFile(INDEX, hash ? { hash } : undefined);
}

const webPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

function createPub() {
  pubWin = new BrowserWindow({
    width: 960, height: 540, show: false, backgroundColor: "#0b1830",
    title: "Lo Que Dijo la Gente · Público", autoHideMenuBar: true, webPreferences,
  });
  pubWin.setMenuBarVisibility(false);
  loadPage(pubWin, "publico");
  pubWin.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    if (isFs(pubWin)) setFs(pubWin, false);
    pubWin.hide();
    pubDisplayId = null;
    notify();
  });
  pubWin.on("enter-full-screen", notify);
  pubWin.on("leave-full-screen", notify);
  harden(pubWin);
}
function ensurePub() {
  if (!pubWin || pubWin.isDestroyed()) createPub();
  return pubWin;
}

// Sends the public view to a display and makes it fullscreen.
function placeOn(display) {
  const w = ensurePub();
  if (isFs(w)) setFs(w, false);
  setTimeout(() => {
    if (w.isDestroyed()) return;
    w.setBounds(core.placedBounds(display.workArea));
    w.show();
    setTimeout(() => {
      if (w.isDestroyed()) return;
      setFs(w, true);
      pubDisplayId = display.id;
      notify();
      if (ctlWin && !ctlWin.isDestroyed() && display.id !== screen.getPrimaryDisplay().id) ctlWin.focus();
    }, 250);
  }, isMac ? 400 : 50);
}

// Leaves the public view in a normal window on your screen.
function windowed() {
  const w = ensurePub();
  if (isFs(w)) setFs(w, false);
  setTimeout(() => {
    if (w.isDestroyed()) return;
    w.setBounds(core.windowedBounds(screen.getPrimaryDisplay().workArea));
    w.show();
    pubDisplayId = null;
    notify();
  }, isMac ? 400 : 50);
}

function autoPlace() {
  const ext = externalDisplay();
  if (ext) placeOn(ext); else windowed();
}

ipcMain.handle("displays", () => pubInfo());
ipcMain.handle("place", (_e, id) => {
  const d = screen.getAllDisplays().find((x) => x.id === id);
  if (d) placeOn(d);
  return true;
});
ipcMain.handle("windowed", () => { windowed(); return true; });
ipcMain.handle("toggle", () => {
  const w = ensurePub();
  if (w.isVisible()) {
    if (isFs(w)) setFs(w, false);
    w.hide();
    pubDisplayId = null;
    setTimeout(notify, 300);
  } else autoPlace();
  return true;
});
// Esc on the public screen: leave fullscreen (in case it ended up over the console).
ipcMain.on("pub-escape", () => windowed());

/* ------------------------------------------------------------------
   Files: bank backup and import
   ------------------------------------------------------------------ */
ipcMain.handle("export", async (_e, { name, text }) => {
  const r = await dialog.showSaveDialog(ctlWin, {
    title: "Guardar respaldo",
    defaultPath: path.join(app.getPath("documents"), name),
    filters: [core.exportFilter(name)],
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, "utf8");
  return r.filePath;
});
ipcMain.handle("import", async () => {
  const r = await dialog.showOpenDialog(ctlWin, {
    title: "Abrir preguntas",
    properties: ["openFile"],
    filters: [{ name: "Preguntas o respaldo", extensions: ["json", "txt"] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), text: fs.readFileSync(p, "utf8") };
});

/* ------------------------------------------------------------------
   Windows
   ------------------------------------------------------------------ */
function harden(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => { if (!core.navigationAllowed(url, DEV_URL)) e.preventDefault(); });
}

function createCtl() {
  const a = screen.getPrimaryDisplay().workArea;
  ctlWin = new BrowserWindow({
    x: a.x, y: a.y, width: Math.min(1440, a.width), height: Math.min(960, a.height),
    minWidth: 400, minHeight: 520, show: false, backgroundColor: "#0b1830",
    title: "Lo Que Dijo la Gente · Consola", webPreferences,
  });
  loadPage(ctlWin);
  ctlWin.once("ready-to-show", () => { ctlWin.maximize(); ctlWin.show(); });
  ctlWin.on("closed", () => { ctlWin = null; quitting = true; app.quit(); });
  harden(ctlWin);
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: "appMenu", label: "Lo Que Dijo la Gente" }] : []),
    { label: "Edición", submenu: [
      { role: "undo", label: "Deshacer" }, { role: "redo", label: "Rehacer" }, { type: "separator" },
      { role: "cut", label: "Cortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Pegar" },
      { role: "selectAll", label: "Seleccionar todo" },
    ] },
    { label: "Ver", submenu: [
      { role: "resetZoom", label: "Tamaño normal" }, { role: "zoomIn", label: "Acercar" }, { role: "zoomOut", label: "Alejar" },
      { type: "separator" },
      { label: "Pantalla del público al proyector", accelerator: "CmdOrCtrl+P", click: autoPlace },
      { label: "Pantalla del público en ventana", accelerator: "CmdOrCtrl+Shift+P", click: windowed },
      { type: "separator" },
      { role: "reload", label: "Recargar" }, { role: "toggleDevTools", label: "Herramientas de desarrollo" },
    ] },
    { role: "windowMenu", label: "Ventana" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (ctlWin) { if (ctlWin.isMinimized()) ctlWin.restore(); ctlWin.focus(); }
  });

  app.whenReady().then(() => {
    store = core.createStore({ dir: path.join(app.getPath("userData"), "datos") });
    store.loadAll();
    buildMenu();
    createCtl();
    createPub();
    pubWin.once("ready-to-show", autoPlace);

    // Plug in the projector while the app is open: the public view moves there by itself.
    screen.on("display-added", (_e, d) => {
      setTimeout(() => {
        const onExternal = pubDisplayId !== null && pubDisplayId !== screen.getPrimaryDisplay().id;
        if (!onExternal) placeOn(d); else notify();
      }, 900);
    });
    // Unplug it: it comes back as a window on your screen.
    screen.on("display-removed", (_e, d) => { if (pubDisplayId === d.id) windowed(); else notify(); });
    screen.on("display-metrics-changed", notify);
  });

  app.on("before-quit", () => { quitting = true; if (store) store.flush(); });
  app.on("window-all-closed", () => app.quit());
}
