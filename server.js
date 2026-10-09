/**
 * mDNS Project Manager - entry point.
 *
 * Starts the HTTP server (dashboard + reverse proxy) and the mDNS responder,
 * and shuts both down cleanly on Ctrl+C. All real logic lives in ./src.
 *
 * Environment variables:
 *   PORT        HTTP port (default 80)
 *   HOST        Bind address (default 0.0.0.0)
 *   CONFIG_FILE Path to projects.json
 *   LOG_LEVEL   debug | info | warn | error (default info)
 */
const http = require('http');
const { PORT, HOST } = require('./src/config/constants');
const store = require('./src/config/store');
const mdns = require('./src/services/mdns');
const { createApp } = require('./src/app');
const { handleUpgrade } = require('./src/services/proxy');
const { getLocalIP } = require('./src/utils/network');
const log = require('./src/utils/logger');

// Load (or create) projects.json before anything reads from it
store.init();

const server = http.createServer(createApp());

// WebSocket upgrades bypass Express, so route them to the proxy directly
server.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head).catch(err => {
        log.error(`WebSocket upgrade failed: ${err.message}`);
        socket.destroy();
    });
});

// Friendly messages for the two most common startup failures
server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        log.error(`Port ${PORT} is already in use. Stop the other program or set PORT to a different value.`);
    } else if (err.code === 'EACCES') {
        log.error(`Permission denied for port ${PORT}. Run as administrator/root, or set PORT to a value above 1024.`);
    } else {
        log.error(`Server error: ${err.message}`);
    }
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    const { mdnsDomain } = store.getSettings();
    const portSuffix = PORT === 80 ? '' : `:${PORT}`;

    log.section('mDNS Project Dashboard');
    log.success(`Dashboard:  http://localhost${portSuffix}`);
    log.info(`On your LAN: http://${mdnsDomain}.local${portSuffix}  or  http://${getLocalIP()}${portSuffix}`);
    log.info(`Projects are reachable at http://<domain>.local${portSuffix}`);

    mdns.start();
});

// Graceful shutdown: send mDNS goodbyes, stop accepting connections, exit.
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn(`${signal} received, shutting down...`);

    await mdns.stop();
    server.close();
    // Don't wait forever on keep-alive / proxied connections
    setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
