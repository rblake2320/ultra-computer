import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("restores onto independent free ports while old listeners remain occupied", () => {
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import net from 'node:net';
    import { chooseInstallPorts, ensureAppPortsFree } from './script/private-runtime.mjs';
    const occupied = net.createServer();
    await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
    const port = occupied.address().port;
    let denied = false;
    try { await ensureAppPortsFree({httpPort:port,grpcPort:port}); } catch { denied = true; }
    const ports = await chooseInstallPorts({httpPort:port,grpcPort:port,redisPort:port});
    occupied.close();
    console.log(JSON.stringify({denied,unique:new Set(Object.values(ports)).size,oldPortAvoided:Object.values(ports).every(p=>p!==port)}));
  `], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 10000 });
  expect(JSON.parse(result)).toEqual({ denied: true, unique: 3, oldPortAvoided: true });
});
