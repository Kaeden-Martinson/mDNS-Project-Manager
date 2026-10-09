/**
 * Reverse proxy: requests for <project>.local are forwarded to the project's
 * local port, including WebSocket upgrades (needed for hot-reload in most
 * dev servers).
 *
 * Fixes over the old version:
 *  - Requests went through body-parser *before* being proxied, which consumed
 *    the body of JSON POSTs so they hung or arrived empty at the project.
 *  - The global cors() middleware answered the project's own CORS preflights.
 *  - The proxy error handler called Express's `res.status()` on raw responses
 *    and on WebSocket sockets, crashing the server.
 *  - WebSocket upgrades for unknown hosts were left hanging forever.
 *  - It proxied to the LAN IP, which fails for projects listening on
 *    127.0.0.1 only; we now target the loopback address the project uses.
 */
const httpProxy = require('http-proxy');
const store = require('../config/store');
const { findListeningHost } = require('./ports');
const { parseHostHeader } = require('../utils/network');
const pages = require('../utils/pages');
const log = require('../utils/logger').child('PROXY');

const proxy = httpProxy.createProxyServer({
    changeOrigin: true, // rewrite Host so dev servers with host checks accept the request
    xfwd: true, // add X-Forwarded-For/-Host/-Proto headers
    ws: true,
});

proxy.on('error', (err, req, resOrSocket) => {
    log.warn(`${req.headers.host}${req.url} -> ${err.message}`);

    // Forget the cached target so the next request re-probes the port
    for (const [port, entry] of targetCache) {
        if (req.proxyTarget && entry.target === req.proxyTarget) targetCache.delete(port);
    }

    // For WebSocket upgrades the third argument is a net.Socket, not a response
    if (!resOrSocket || typeof resOrSocket.writeHead !== 'function') {
        if (resOrSocket && !resOrSocket.destroyed) resOrSocket.destroy();
        return;
    }
    if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    resOrSocket.end(pages.message('Bad Gateway', `The project could not be reached: ${err.message}`));
});

// Remember which loopback address each port answered on, briefly, so we don't
// open a probe connection for every single proxied request. Only successful
// lookups are cached, so a project that was just started is reachable at once.
const targetCache = new Map(); // port -> { host, expires }
const CACHE_MS = 3000;

/** @returns {Promise<string|null>} "http://127.0.0.1:3000" style target, or null if offline */
async function resolveTarget(port) {
    const cached = targetCache.get(port);
    if (cached && cached.expires > Date.now()) return cached.target;

    const host = await findListeningHost(port);
    if (!host) return null;
    const target = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
    targetCache.set(port, { target, expires: Date.now() + CACHE_MS });
    return target;
}

/** Find the project for an incoming request based on its Host header. */
function projectForRequest(req) {
    return store.findProjectByDomain(parseHostHeader(req.headers.host));
}

/**
 * Express middleware: proxy requests for project domains. If the project is
 * offline, show a friendly page instead of the old behaviour of silently
 * serving a broken copy of the dashboard.
 */
async function proxyMiddleware(req, res, next) {
    const project = projectForRequest(req);
    if (!project) return next();

    try {
        const target = await resolveTarget(project.port);
        if (!target) {
            return res.status(503).type('html').send(pages.projectOffline(project, req));
        }
        req.proxyTarget = target;
        proxy.web(req, res, { target });
    } catch (err) {
        next(err);
    }
}

/** http.Server 'upgrade' handler for WebSocket connections. */
async function handleUpgrade(req, socket, head) {
    const project = projectForRequest(req);
    const target = project && (await resolveTarget(project.port));
    if (!target) {
        socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        return;
    }
    log.debug(`WebSocket ${project.domain}.local -> ${target}`);
    req.proxyTarget = target;
    proxy.ws(req, socket, head, { target });
}

module.exports = { proxyMiddleware, handleUpgrade };
