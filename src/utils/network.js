/**
 * Helpers for working out which IP addresses / hostnames belong to this machine.
 */
const os = require('os');

// Adapter names that are almost never the "real" LAN connection. Picking one of
// these used to make mDNS hand out an unreachable IP (e.g. Hyper-V / WSL / VPN).
const VIRTUAL_ADAPTER = /(vEthernet|VirtualBox|VMware|Hyper-V|WSL|docker|br-|veth|virbr|Loopback|tailscale|zerotier|utun|tun|tap)/i;

/**
 * All non-internal IPv4 interfaces, real adapters first.
 * @returns {{name: string, address: string, netmask: string}[]}
 */
function getIPv4Interfaces() {
    const result = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
        for (const iface of addrs || []) {
            // Node <18.4 reports family as the string 'IPv4', newer versions may use the number 4
            const isV4 = iface.family === 'IPv4' || iface.family === 4;
            if (isV4 && !iface.internal) {
                result.push({ name, address: iface.address, netmask: iface.netmask });
            }
        }
    }
    return result.sort((a, b) => VIRTUAL_ADAPTER.test(a.name) - VIRTUAL_ADAPTER.test(b.name));
}

/** Best guess at this machine's LAN IPv4 address (falls back to loopback). */
function getLocalIP() {
    const [first] = getIPv4Interfaces();
    return first ? first.address : '127.0.0.1';
}

/** Convert dotted IPv4 to an unsigned 32-bit integer. */
function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

/**
 * Pick the local IPv4 address on the same subnet as `remoteAddress`.
 * Used so an mDNS answer contains an IP the asking device can actually reach.
 */
function getLocalIPFor(remoteAddress) {
    const remote = String(remoteAddress || '').replace(/^::ffff:/, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(remote)) {
        const target = ipToInt(remote);
        for (const iface of getIPv4Interfaces()) {
            const mask = ipToInt(iface.netmask);
            if ((ipToInt(iface.address) & mask) === (target & mask)) return iface.address;
        }
    }
    return getLocalIP();
}

/** True if the address is a loopback address (127.x, ::1, ::ffff:127.x). */
function isLoopback(address) {
    const addr = String(address || '').replace(/^::ffff:/, '');
    return addr === '::1' || addr.startsWith('127.') || addr === 'localhost';
}

/** True if the address belongs to this machine (loopback or any local interface). */
function isLocalAddress(address) {
    const addr = String(address || '').replace(/^::ffff:/, '');
    if (isLoopback(addr)) return true;
    return Object.values(os.networkInterfaces())
        .flat()
        .some(iface => iface && iface.address === addr);
}

/**
 * Hostnames that should show the dashboard: localhost, every local IP, the
 * machine's own hostname and the configured mDNS domain.
 */
function getDashboardHosts(mdnsDomain) {
    const hostname = os.hostname().toLowerCase();
    const hosts = new Set(['localhost', '127.0.0.1', '::1', hostname, `${hostname}.local`]);
    if (mdnsDomain) {
        hosts.add(mdnsDomain);
        hosts.add(`${mdnsDomain}.local`);
    }
    for (const iface of Object.values(os.networkInterfaces()).flat()) {
        if (iface) hosts.add(iface.address.toLowerCase());
    }
    return hosts;
}

/**
 * Extract the hostname (without port) from a Host header.
 * Handles IPv6 literals such as "[::1]:80".
 */
function parseHostHeader(hostHeader) {
    const host = String(hostHeader || '').trim().toLowerCase();
    if (host.startsWith('[')) return host.slice(1, host.indexOf(']'));
    return host.split(':')[0];
}

module.exports = {
    getLocalIP,
    getLocalIPFor,
    getIPv4Interfaces,
    isLoopback,
    isLocalAddress,
    getDashboardHosts,
    parseHostHeader,
};
