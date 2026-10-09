/**
 * OS-level process helpers: which PIDs are listening on a port, what those
 * processes are, and how to kill them (including their child processes).
 *
 * Fixes over the old version:
 *  - `netstat | findstr :3000` matched :30001 and *remote* port 3000, so
 *    stopping a project could kill your browser. We now parse the
 *    local-address column and only consider LISTENING sockets.
 *  - It was Windows-only; macOS/Linux now use `lsof` + signals.
 *  - It used execSync, freezing the whole server while netstat ran.
 *  - It could kill the dashboard itself if a project used the same port.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const find = require('find-process');
const log = require('../utils/logger').child('PROCESS');

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';

/**
 * PIDs of processes with a LISTENING TCP socket on the given local port.
 * @returns {Promise<number[]>}
 */
async function findListeningPids(port) {
    const pids = new Set();
    try {
        if (IS_WINDOWS) {
            const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true });
            // Also include IPv6 sockets (netstat -p TCP only lists IPv4)
            const { stdout: stdout6 } = await execFileAsync('netstat', ['-ano', '-p', 'TCPv6'], { windowsHide: true });

            for (const line of `${stdout}\n${stdout6}`.split(/\r?\n/)) {
                // Columns: Proto  LocalAddress  ForeignAddress  State  PID
                const cols = line.trim().split(/\s+/);
                if (cols.length < 5 || !/^TCP/i.test(cols[0])) continue;
                const localPort = cols[1].slice(cols[1].lastIndexOf(':') + 1);
                // State is localised on non-English Windows, but LISTENING sockets
                // always have a foreign port of 0, so check that instead.
                const isListening = /:0$/.test(cols[2]);
                if (localPort === String(port) && isListening) pids.add(Number(cols[4]));
            }
        } else {
            // -t: PIDs only, -sTCP:LISTEN: listening sockets only
            const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
            stdout.split(/\s+/).filter(Boolean).forEach(pid => pids.add(Number(pid)));
        }
    } catch (err) {
        // lsof exits with code 1 when nothing matches; that's not an error for us.
        if (err.code !== 1) log.debug(`Listener lookup for port ${port} failed: ${err.message}`);
    }

    pids.delete(0); // "System Idle Process" / placeholder
    pids.delete(process.pid); // never kill ourselves
    return [...pids];
}

/**
 * Name / command line of the process listening on a port (for the scan view).
 * @returns {Promise<{pid:number, name:string, cmd:string}|null>}
 */
async function getProcessInfoForPort(port) {
    const [pid] = await findListeningPids(port);
    if (!pid) return null;
    try {
        const [proc] = await find('pid', pid);
        if (proc) return { pid, name: proc.name, cmd: proc.cmd || '' };
    } catch (err) {
        log.debug(`Process lookup for PID ${pid} failed: ${err.message}`);
    }
    return { pid, name: '', cmd: '' };
}

/**
 * Kill a process and all of its children.
 *
 * On Windows `taskkill /T` walks the process tree. On Unix we send the signal
 * to the process group (negative PID) first, which works for projects we
 * launched as group leaders, and fall back to the single PID.
 */
async function killTree(pid) {
    if (!pid || pid === process.pid) return false;
    try {
        if (IS_WINDOWS) {
            await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
        } else {
            try {
                process.kill(-pid, 'SIGTERM');
            } catch {
                process.kill(pid, 'SIGTERM');
            }
        }
        log.info(`Killed PID ${pid}`);
        return true;
    } catch (err) {
        log.warn(`Could not kill PID ${pid}: ${err.message.trim()}`);
        return false;
    }
}

/**
 * Kill everything listening on a port.
 * @returns {Promise<number[]>} the PIDs that were successfully killed
 */
async function killPort(port) {
    const pids = await findListeningPids(port);
    if (pids.length === 0) {
        log.debug(`Nothing listening on port ${port}`);
        return [];
    }
    const killed = [];
    for (const pid of pids) {
        if (await killTree(pid)) killed.push(pid);
    }
    return killed;
}

module.exports = { findListeningPids, getProcessInfoForPort, killTree, killPort };
