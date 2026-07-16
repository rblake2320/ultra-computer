import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const host = process.argv[2];
const port = Number(process.argv[3]);
const timeoutMs = Number(process.argv[4] ?? 60_000);

if (!host || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError("Usage: node script/wait-for-tcp.mjs <host> <port> [timeout-ms]");
}

const deadline = Date.now() + timeoutMs;
let lastError = "connection not attempted";

while (Date.now() < deadline) {
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const done = (error) => {
        socket.destroy();
        error ? reject(error) : resolve();
      };
      socket.setTimeout(2_000, () => done(new Error("connection timed out")));
      socket.once("connect", () => done());
      socket.once("error", done);
    });
    console.log(`TCP endpoint ready: ${host}:${port}`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await delay(500);
  }
}

throw new Error(`TCP endpoint ${host}:${port} was not ready within ${timeoutMs}ms: ${lastError}`);
