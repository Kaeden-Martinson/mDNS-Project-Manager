/**
 * mDNS responder: answers "who is <domain>.local?" for the dashboard domain
 * and every project domain, pointing them all at this machine. The HTTP
 * server then uses the Host header to decide which project to proxy to.
 *
 * Fixes over the old version:
 *  - An unhandled 'error' event from the multicast socket crashed the server.
 *  - Name matching was case-sensitive (DNS names are case-insensitive).
 *  - It always answered with the first network adapter's IP, which on Windows
 *    is often a Hyper-V/WSL virtual adapter. We now answer with the address on
 *    the same subnet as the device asking.
 *  - Projects removed from the list stayed cached on other devices; we now
 *    send a "goodbye" (TTL 0) on shutdown.
 */
const multicastDns = require('multicast-dns');
const store = require('../config/store');
const { getLocalIP, getLocalIPFor } = require('../utils/network');
const { MDNS_TTL, MDNS_ANNOUNCE_INTERVAL } = require('../config/constants');
const log = require('../utils/logger').child('MDNS');

let responder = null;
let announceTimer = null;

/** Every hostname we answer for, e.g. ["mdns.local", "myapp.local"]. */
function allHostnames() {
    const { mdnsDomain } = store.getSettings();
    const domains = [mdnsDomain, ...store.getProjects().map(p => p.domain)];
    return [...new Set(domains.filter(Boolean))].map(d => `${d}.local`);
}

/** Build an A record. */
function aRecord(name, ip, ttl = MDNS_TTL) {
    // 'flush' tells caches to replace (not add to) existing records for this name
    return { name, type: 'A', class: 'IN', ttl, flush: true, data: ip };
}

/** Handle an incoming mDNS query packet. */
function onQuery(packet, rinfo) {
    const hostnames = allHostnames();
    const answers = [];

    for (const question of packet.questions || []) {
        const name = String(question.name || '').toLowerCase();
        const wantsA = question.type === 'A' || question.type === 'ANY';
        if (wantsA && hostnames.includes(name)) {
            answers.push(aRecord(name, getLocalIPFor(rinfo && rinfo.address)));
        }
    }

    if (answers.length > 0) {
        responder.respond({ answers });
        log.debug(`Answered ${answers.map(a => a.name).join(', ')} for ${rinfo && rinfo.address}`);
    }
}

/** Proactively broadcast all of our names so caches stay warm. */
function announce(ttl = MDNS_TTL) {
    if (!responder) return;
    const ip = getLocalIP();
    const answers = allHostnames().map(name => aRecord(name, ip, ttl));
    if (answers.length === 0) return;
    responder.respond({ answers }, err => {
        if (err) log.debug(`Announcement failed: ${err.message}`);
    });
    log.debug(`Announced ${answers.length} name(s) as ${ip}`);
}

/** Start the responder. Returns false if mDNS could not be started. */
function start() {
    try {
        responder = multicastDns();
    } catch (err) {
        log.warn(`mDNS unavailable: ${err.message}`);
        return false;
    }

    responder.on('query', onQuery);
    responder.on('warning', err => log.debug(`mDNS warning: ${err.message}`));
    responder.on('error', err => {
        // Usually port 5353 is held exclusively by another program
        log.warn(`mDNS error: ${err.message}. .local names may not resolve, but the dashboard still works by IP.`);
    });

    announce();
    announceTimer = setInterval(announce, MDNS_ANNOUNCE_INTERVAL);
    announceTimer.unref();

    log.success(`Responding for ${allHostnames().join(', ')}`);
    return true;
}

/** Say goodbye (TTL 0) and close the socket. */
function stop() {
    return new Promise(resolve => {
        if (!responder) return resolve();
        clearInterval(announceTimer);
        announce(0);
        // Give the goodbye packet a moment to leave before closing the socket
        setTimeout(() => {
            responder.destroy();
            responder = null;
            resolve();
        }, 100);
    });
}

/** Tell the network about a newly added/renamed domain right away. */
function refresh() {
    announce();
}

module.exports = { start, stop, refresh };
