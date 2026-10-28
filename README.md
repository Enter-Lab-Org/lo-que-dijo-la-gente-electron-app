# Lo Que Dijo la Gente · Electron desktop app

Desktop version of the offline team survey game ("Family Feud" style): the React app from
`../lo-que-dijo-la-gente_web_app` running inside Electron, with every feature of the original desktop app
(`../lo-que-dijo-la-gente`). Same Spanish (es-MX) copy, storage keys, backup format and `window.ldlg` bridge.

- **Console window**: host controls, question bank, client design, live monitor.
- **Public window** (`#publico`): read-only board. It goes to the projector by itself.

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install the pinned dependencies (see note below) |
| `npm run dev` | Vite dev server on http://localhost:8081 + Electron loading it (HMR) |
| `npm start` | Production build, then Electron on the built files (`dist/`) |
| `npm run electron` | Electron on the current `dist/` without rebuilding |
| `npm test` | Vitest in watch mode (`npx vitest run` for a single run) |
| `npm run build` | Production build into `dist/` |
| `npm run dist:all` | From Linux: AppImage, Windows installer + portable, Mac zips (Apple Silicon + Intel). Cleans `release/` first |
| `npm run dist:linux` | Linux x64 AppImage |
| `npm run dist:linux:dir` | Unpacked Linux app in `release/linux-unpacked/` (quick local check) |
| `npm run dist:win` | Windows x64 installer (NSIS) + portable `.exe`. Run on Windows |
| `npm run dist:win:container` | Same Windows build from Linux/macOS, inside `electronuserland/builder:wine` (needs podman or docker) |
| `npm run dist:mac` | Mac `.dmg` + `.zip` for Apple Silicon and Intel. Run on a Mac |
| `npm run dist:mac:zip` | Mac `.zip` only, works from Linux |

All packages land in `release/` as `LoQueDijoLaGente-<version>-<Platform>-<...>`. Nothing is signed yet
(HU-34): Windows shows SmartScreen and Mac needs the `xattr`/`codesign` step from `LEEME.txt` the first time.
A `.dmg` can only be built on macOS.

## CI pipeline (GitHub Actions)

`.github/workflows/build-desktop.yml` builds every platform on its native runner, so the `.dmg` and
Windows installers need no Mac, Wine or container on your side.

| Trigger | Result |
| --- | --- |
| Pull request, push to `main`, manual run on a branch | Tests only |
| Tag `v*` (e.g. `git tag v1.0.1 && git push --tags`), or manual run on that tag | Tests, Linux/Windows/Mac installers (also kept 14 days as workflow artifacts), and a **draft** GitHub Release with the installers and `LEEME.txt` |

Installers are built only for tags, which keeps macOS and Windows runner minutes out of everyday pushes.
`LEEME.txt` is the end-user guide (Spanish) attached to each release.

The tag must match `version` in `package.json`, or the run fails before building.
The workflow expects this folder to be the repository root.

npm 11 can block install scripts. If `node_modules/electron/dist` is missing after `npm install`,
run `node node_modules/electron/install.js`.

## Structure

```
electron/
  main.cjs      Main process: windows, menu, IPC, displays, file dialogs, single instance
  preload.cjs   window.ldlg bridge (contextBridge). Self-contained: sandboxed preloads only get "electron"
  core.cjs      Pure helpers used by main.cjs (store, display picking, bounds, navigation rule)
  *.test.js     Vitest, Node environment (no GUI)
scripts/
  dev.mjs       Starts the Vite server, then Electron with ELECTRON_DEV_URL set
src/            React app (same layers as the web version)
  domain/       Pure game logic
  adapters/     Side effects; native.js is the only place reading window.ldlg
  hooks/ containers/ components/ styles/ test/
index.html  vite.config.js
```

The `.cjs` extension keeps the Electron files CommonJS while the package is `"type": "module"` for Vite.

## Desktop features

- Two windows. The public window starts fullscreen on the first external display, or as a window
  on your screen if there is none.
- Plug in a projector while the app runs: the public view moves there. Unplug it: it comes back as a window.
- Menu **Ver**: `Ctrl/Cmd+P` sends the public view to the projector, `Ctrl/Cmd+Shift+P` puts it in a window.
- `Esc` on the public screen leaves fullscreen. Closing the public window only hides it; the console can show it again.
- Data is saved as one JSON file per key in the app data folder, with a 400 ms debounce, atomic writes
  (tmp + rename) and a flush on quit:
  - Windows: `%APPDATA%\Lo Que Dijo la Gente\datos`
  - Mac: `~/Library/Application Support/Lo Que Dijo la Gente/datos`
  - Linux: `~/.config/Lo Que Dijo la Gente/datos`

  It is the same folder as the original desktop app, so existing games and banks carry over.
- Bank backup and import use native save/open dialogs.
- Only one instance runs; opening it again focuses the console.
- Security: `contextIsolation`, `sandbox`, no `nodeIntegration`, `window.open` denied, navigation blocked.
  The CSP meta is added only in the build, right after the charset.

## Dev mode

`npm run dev` sets `ELECTRON_DEV_URL=http://localhost:8081`. The main process then loads that URL (and
`#publico`) instead of `dist/index.html`, and allows navigation only to that origin (for Vite full reloads).
The variable is ignored in a packaged app. Electron prints an "Insecure CSP" warning in dev because the dev
server has no CSP (Vite needs a websocket for HMR); the build has one.

## Differences from the web version

- Runs in Electron: storage, window sync, files and projector use the native bridge instead of
  `localStorage`, `BroadcastChannel`, downloads and `window.open`.
- The CSP meta is placed right after `<meta charset>` instead of at the end of `<head>`, so it covers the
  module script and stylesheet tags.
- Vitest has two projects: `web` (jsdom, `src/`) and `electron` (Node, `electron/`).
- React is a dev dependency: it is bundled into `dist/`, so the packaged app ships no `node_modules`.

## Storage keys

`ldlg-v2` (game), `ldlg-pub` (public state), `ldlg-theme-v2` (design), `ldlg-banco` (bank), `ldlg-tab`, `ldlg-seeded`.
