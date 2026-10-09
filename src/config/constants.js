/**
 * Static configuration values. Anything a user might reasonably want to change
 * without editing code can be overridden through environment variables.
 */
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

module.exports = {
    ROOT_DIR,

    /** Port the dashboard listens on. 80 lets you browse to http://mdns.local without a port. */
    PORT: parseInt(process.env.PORT, 10) || 80,

    /** Interface the dashboard binds to. 0.0.0.0 = reachable from the LAN. */
    HOST: process.env.HOST || '0.0.0.0',

    /** Where projects and settings are persisted. */
    CONFIG_FILE: process.env.CONFIG_FILE || path.join(ROOT_DIR, 'projects.json'),

    /** Folder that holds per-project stdout/stderr logs of launched processes. */
    LOG_DIR: path.join(ROOT_DIR, 'logs'),

    /** Static frontend assets. */
    PUBLIC_DIR: path.join(ROOT_DIR, 'public'),

    /** Default settings written to a fresh projects.json. */
    DEFAULT_SETTINGS: {
        mdnsDomain: 'mdns',
        scanRange: { start: 3000, end: 9999 },
    },

    /** TTL (seconds) advertised in mDNS answers. */
    MDNS_TTL: 120,

    /** How often (ms) all domains are proactively re-announced on the network. */
    MDNS_ANNOUNCE_INTERVAL: 30_000,
};
