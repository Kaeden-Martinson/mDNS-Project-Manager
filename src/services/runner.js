/**
 * Starts, stops and restarts project processes.
 *
 * Fixes over the old version:
 *  - `exec()` buffers all output in memory and kills the child once it has
 *    printed more than 1 MB, so long-running dev servers died at random. We
 *    now `spawn()` and send output to logs/<domain>.log instead.
 *  - Commands like "node server.js" were rewritten to `node "node server.js"`
 *    because the file-extension check ran on the whole command line.
 *  - "python3" doesn't exist on most Windows installs; we use "python" there.
 *  - Starting a project that was already running launched a second copy.
 *  - A missing/invalid working directory produced a confusing ENOENT.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { LOG_DIR } = require('../config/constants');
const { ValidationError } = require('../utils/validation');
const { isPortOpen, waitForPort } = require('./ports');
const { killTree, killPort } = require('./processes');
const log = require('../utils/logger').child('RUNNER');

const IS_WINDOWS = process.platform === 'win32';

/** Children we launched in this session, keyed by project id. */
const running = new Map(); // id -> { child, startedAt, command }

/** Path of the log file that captures a project's output. */
function logFileFor(project) {
    return path.join(LOG_DIR, `${project.domain}.log`);
}

/**
 * If the command is just a path to a script (no arguments), prefix the right
 * interpreter. Anything with arguments ("npm start", "node app.js") is left alone.
 */
function buildCommand(executable, cwd) {
    const command = executable.trim();
    const isSingleToken = !/\s/.test(command) || /^"[^"]+"$/.test(command);
    if (!isSingleToken) return command;

    const file = command.replace(/^"|"$/g, '');
    const quoted = `"${file}"`;
    switch (path.extname(file).toLowerCase()) {
        case '.py':
            return `${IS_WINDOWS ? 'python' : 'python3'} ${quoted}`;
        case '.js':
        case '.mjs':
        case '.cjs':
            return `node ${quoted}`;
        case '.ps1':
            return `powershell -ExecutionPolicy Bypass -File ${quoted}`;
        case '.sh':
            return `sh ${quoted}`;
        case '.bat':
        case '.cmd':
            return IS_WINDOWS ? `cmd /c ${quoted}` : quoted;
        default:
            // A bare relative executable in the project folder needs ./ on Unix
            if (!IS_WINDOWS && !path.isAbsolute(file) && fs.existsSync(path.join(cwd, file))) {
                return `./${file}`;
            }
            return command;
    }
}

/** Resolve and check the project's working directory. */
function resolveWorkingDir(project) {
    if (!project.path) throw new ValidationError('No directory set for this project');
    const dir = path.resolve(project.path);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        throw new ValidationError(`Directory does not exist: ${dir}`);
    }
    return dir;
}

/**
 * Launch a project's command in its directory.
 * @returns {Promise<object>} details about the started process
 */
async function start(project) {
    if (!project.executable) throw new ValidationError('No command defined for this project');
    if (await isPortOpen(project.port)) {
        throw new ValidationError(`Port ${project.port} is already in use - is the project already running?`, 409);
    }

    const cwd = resolveWorkingDir(project);
    const command = buildCommand(project.executable, cwd);

    // Append the process output to a per-project log file. Using a file (not a
    // pipe) means the project keeps running fine even if the dashboard stops.
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFile = logFileFor(project);
    const out = fs.openSync(logFile, 'a');
    fs.writeSync(out, `\n===== ${new Date().toISOString()} | ${command} | ${cwd} =====\n`);

    log.info(`Starting "${project.name}": ${command}`);
    log.debug(`Working directory: ${cwd}`);

    const child = spawn(command, {
        cwd,
        shell: true,
        stdio: ['ignore', out, out],
        windowsHide: true,
        // On Unix this makes the child a process-group leader so we can kill
        // the whole tree later. On Windows it would pop up a console window.
        detached: !IS_WINDOWS,
        env: { ...process.env, PORT: String(project.port) },
    });
    fs.closeSync(out); // the child has its own copy of the descriptor

    // Wait for spawn() to either succeed or fail before replying.
    await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', err => reject(new Error(`Failed to start: ${err.message}`)));
    });

    running.set(String(project.id), { child, startedAt: Date.now(), command });
    child.once('exit', (code, signal) => {
        // Only forget it if this is still the child we're tracking (not a newer restart).
        const entry = running.get(String(project.id));
        if (entry && entry.child === child) running.delete(String(project.id));
        log.info(`"${project.name}" exited (${signal || `code ${code}`})`);
    });
    child.unref(); // don't keep the dashboard alive just for this child

    return { pid: child.pid, command, cwd, port: project.port, domain: project.domain, logFile };
}

/**
 * Stop a project: kill the process tree we launched (if any) plus anything
 * still listening on the project's port.
 * @returns {Promise<boolean>} true if the port is free afterwards
 */
async function stop(project) {
    const entry = running.get(String(project.id));
    if (entry) {
        await killTree(entry.child.pid);
        running.delete(String(project.id));
    }
    await killPort(project.port);
    return waitForPort(project.port, { open: false, timeoutMs: 5000 });
}

/** Stop then start again, waiting for the port to free up in between. */
async function restart(project) {
    const freed = await stop(project);
    if (!freed) {
        throw new Error(`Port ${project.port} is still in use after stopping - could not restart`);
    }
    return start(project);
}

/** Whether we launched this project ourselves during this session. */
function isManaged(project) {
    return running.has(String(project.id));
}

/** Last `maxBytes` of a project's log file. */
function readLog(project, maxBytes = 64 * 1024) {
    const file = logFileFor(project);
    if (!fs.existsSync(file)) return '';
    const { size } = fs.statSync(file);
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(file, 'r');
    try {
        fs.readSync(fd, buffer, 0, length, size - length);
    } finally {
        fs.closeSync(fd);
    }
    return buffer.toString('utf8');
}

module.exports = { start, stop, restart, isManaged, readLog, buildCommand };
