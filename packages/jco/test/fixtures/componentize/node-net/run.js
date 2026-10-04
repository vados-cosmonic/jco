import net from "node:net";
import { spawn } from "node:child_process";
import { argv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// TEMP(debug): progress output and a watchdog to locate the nondeterministic hang
const debugRole = argv[3] === "server" ? "guest-server" : "runner";
const debugStartedAt = Date.now();
function debug(message) {
    process.stderr.write(`[debug:run.js:${debugRole}:${process.pid}] +${Date.now() - debugStartedAt}ms ${message}\n`);
}
function debugDescribeHandles() {
    const handles = process._getActiveHandles().map((handle) => {
        const name = handle?.constructor?.name;
        if (name === "Socket") {
            return `Socket(fd=${handle._handle?.fd}, local=${handle.localAddress}:${handle.localPort}, remote=${handle.remoteAddress}:${handle.remotePort}, destroyed=${handle.destroyed})`;
        }
        if (name === "ChildProcess") {
            return `ChildProcess(pid=${handle.pid}, exitCode=${handle.exitCode}, args=${handle.spawnargs?.slice(-2).join(" ")})`;
        }
        return name;
    });
    return JSON.stringify({ resources: process.getActiveResourcesInfo(), handles });
}
// Only fires if the event loop stays responsive; a synchronously blocked guest call
// is instead identified by the last progress line.
const debugWatchdog = setTimeout(() => {
    debug(`WATCHDOG: still running after 60s: ${debugDescribeHandles()}`);
    process.exit(99);
}, 60_000);
debugWatchdog.unref();
process.on("exit", (code) => debug(`process exit (code=${code})`));

debug("importing transpiled component");
const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
// The existing StarlingMonkey bindings require these compatibility members.
imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
debug("instantiating");
const instance = await instantiate(undefined, imports);
debug("instantiated");
if (argv[3] === "server") {
    const port = await instance.startServer();
    debug(`startServer() -> ${port}`);
    stdout.write(`${port}\n`);
    await instance.serveOne();
    debug("serveOne() returned");
    process.exit(0);
}
const surface = JSON.parse(await instance.surface());
debug("surface() returned");

function childPort(child) {
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Peer exited before listening: ${code}`)));
        child.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
    });
}

const host = spawn(process.execPath, [fileURLToPath(new URL("./peer.js", import.meta.url))], {
    stdio: ["ignore", "pipe", "inherit"],
});
let guest;
try {
    const hostPort = await childPort(host);
    debug(`host peer (pid=${host.pid}) listening on ${hostPort}; calling runClient()`);
    const client = await instance.runClient(hostPort);
    debug(`runClient() -> ${JSON.stringify(client)}; spawning guest server`);
    guest = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), argv[2], "server"], {
        stdio: ["ignore", "pipe", "inherit"],
    });
    const guestExit = new Promise((resolve, reject) => {
        guest.once("error", reject);
        guest.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Guest server exited: ${code}`))));
    });
    const port = await childPort(guest);
    debug(`guest server (pid=${guest.pid}) listening on ${port}; connecting`);
    const response = new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1").setEncoding("utf8");
        let body = "";
        socket.on("data", (chunk) => {
            body += chunk;
        });
        socket.once("error", reject);
        socket.once("end", () => resolve(body));
        socket.end("runner");
    });
    const server = await response;
    debug(`guest server responded ${JSON.stringify(server)}; awaiting guest exit`);
    await guestExit;
    debug("guest server exited; writing result");
    stdout.write(`${JSON.stringify({ surface, client, server })}\n`);
} finally {
    guest?.kill();
    host.kill();
    debug(`finally: children killed; awaiting natural exit: ${debugDescribeHandles()}`);
    // Unref'd, so these only fire if something else keeps the event loop alive
    for (const delay of [2_000, 10_000, 30_000]) {
        setTimeout(() => debug(`still alive ${delay}ms after finishing: ${debugDescribeHandles()}`), delay).unref();
    }
}
