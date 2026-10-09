/**
 * Request guards for the dashboard and its API.
 *
 * The API can launch arbitrary commands, so it must not be callable by random
 * websites. The old server had `cors()` enabled for every origin, meaning any
 * page you visited could silently POST to http://localhost/api and run code
 * on your machine. These guards close that hole:
 *
 *  1. Host check - the dashboard/API only answer on known hostnames
 *     (localhost, this machine's IPs, the mDNS domain). This blocks
 *     DNS-rebinding attacks, where evil.com is pointed at 127.0.0.1.
 *  2. Origin check - state-changing requests must come from a page served by
 *     this same host. Browsers always send Origin on cross-site POST/PUT/DELETE.
 */
const store = require('../config/store');
const { getDashboardHosts, parseHostHeader, isLocalAddress } = require('../utils/network');
const pages = require('../utils/pages');
const log = require('../utils/logger').child('SECURITY');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Is this request addressed to the dashboard (vs. a project or unknown host)? */
function isDashboardHost(req) {
    const host = parseHostHeader(req.headers.host);
    return getDashboardHosts(store.getSettings().mdnsDomain).has(host);
}

/** Reject requests whose Host header isn't one of ours. */
function requireDashboardHost(req, res, next) {
    if (isDashboardHost(req)) return next();

    const host = parseHostHeader(req.headers.host);
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    return res.status(404).type('html').send(pages.unknownHost(host, req));
}

/** Reject cross-origin state-changing requests (CSRF protection). */
function requireSameOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    // Non-browser clients (curl, scripts) don't send Origin; allow those.
    if (!origin) return next();

    let originHost;
    try {
        originHost = new URL(origin).host.toLowerCase();
    } catch {
        originHost = null;
    }
    if (originHost && originHost === String(req.headers.host || '').toLowerCase()) return next();

    log.warn(`Blocked cross-origin ${req.method} ${req.originalUrl} from ${origin}`);
    return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
}

/** Mark responses to non-local clients so the UI can show the remote banner. */
function markRemoteClients(req, res, next) {
    if (!isLocalAddress(req.socket.remoteAddress)) res.set('X-Remote-Connection', 'true');
    next();
}

module.exports = { isDashboardHost, requireDashboardHost, requireSameOrigin, markRemoteClients };
