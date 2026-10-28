// Dev workflow: Vite dev server on 8081 + Electron pointed at it via ELECTRON_DEV_URL.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

const electron = createRequire(import.meta.url)("electron"); // path to the Electron binary

const server = await createServer();
await server.listen();
const url = "http://localhost:" + server.config.server.port;
server.printUrls();

const child = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, ELECTRON_DEV_URL: url } });
const stop = async (code = 0) => { await server.close(); process.exit(code); };
child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
