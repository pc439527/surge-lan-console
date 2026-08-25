import { createCoreApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { server } = createCoreApp({
  databasePath: config.databasePath,
  sessionIdleMs: config.sessionIdleMs,
  sessionAbsoluteMs: config.sessionAbsoluteMs,
});

server.listen(config.port, config.host, () => {
  console.log(`[core] Surge LAN Console Core listening on ${config.host}:${config.port}`);
  console.log(`[core] SQLite: ${config.databasePath}`);
});

server.on("error", (error) => {
  console.error(`[core] startup failed: ${error.message}`);
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[core] ${signal} received, shutting down`);
  server.close((error) => {
    if (error) {
      console.error(`[core] shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
