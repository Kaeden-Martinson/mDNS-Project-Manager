/**
 * TCP port probing.
 *
 * The old implementation checked ports one-by-one with `tcp-port-used`. On
 * Windows a refused connection to localhost takes ~1-2 seconds, so scanning
 * the default 3000-9999 range could take hours. Here we use raw sockets with
 * a short timeout and run many probes in parallel.
 */
const net = require('net');

// Loopback addresses to try. Newer Node versions bind "localhost" to ::1 only,
// so a server can be invisible on 127.0.0.1 while still running.
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

/**
 * Try to open a TCP connection to host:port.
 * @returns {Promise<boolean>} true if something accepted the connection
 */
function tryConnect(port, host, timeoutMs = 400) {
    return new Promise(resolve => {
        const socket = net.connect({ port, host });
        const done = result => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });
}

/**
 * Find which loopback address (if any) a local service on `port` is reachable on.
 * @returns {Promise<string|null>} "127.0.0.1", "::1" or null if nothing is listening
 */
async function findListeningHost(port, timeoutMs) {
    // Probe all addresses in parallel; prefer them in LOOPBACK_HOSTS order
    const results = await Promise.all(LOOPBACK_HOSTS.map(host => tryConnect(port, host, timeoutMs)));
    const index = results.indexOf(true);
    return index === -1 ? null : LOOPBACK_HOSTS[index];
}

/** @returns {Promise<boolean>} whether anything is listening on the local port */
async function isPortOpen(port, timeoutMs) {
    return (await findListeningHost(port, timeoutMs)) !== null;
}

/**
 * Scan a range of local ports with limited concurrency.
 * @returns {Promise<number[]>} sorted list of open ports
 */
async function scanPorts(start, end, { concurrency = 256, timeoutMs = 300 } = {}) {
    const open = [];
    let next = start;

    // Each worker pulls the next port off the shared counter until the range is exhausted.
    async function worker() {
        while (next <= end) {
            const port = next++;
            if (await isPortOpen(port, timeoutMs)) open.push(port);
        }
    }

    const workers = Math.min(concurrency, end - start + 1);
    await Promise.all(Array.from({ length: workers }, worker));
    return open.sort((a, b) => a - b);
}

/**
 * Wait until a port reaches the desired state (open/closed) or the timeout expires.
 * @returns {Promise<boolean>} true if the desired state was reached
 */
async function waitForPort(port, { open, timeoutMs = 10_000, intervalMs = 250 }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await isPortOpen(port)) === open) return true;
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return (await isPortOpen(port)) === open;
}

module.exports = { isPortOpen, findListeningHost, scanPorts, waitForPort };
