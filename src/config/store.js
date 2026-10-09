/**
 * Persistent project/settings store backed by projects.json.
 *
 * The file is read once at startup and kept in memory; every mutation is
 * written straight back to disk. Writes go to a temp file first and are then
 * renamed over the original so a crash mid-write can't leave a half-written,
 * unparseable config behind.
 */
const fs = require('fs');
const crypto = require('crypto');
const { CONFIG_FILE, DEFAULT_SETTINGS, PORT } = require('./constants');
const { ValidationError } = require('../utils/validation');
const log = require('../utils/logger').child('CONFIG');

/** In-memory copy of projects.json. */
let state = null;

/** Deep-ish clone of the default settings so callers can't mutate them. */
function defaultSettings() {
    return { ...DEFAULT_SETTINGS, scanRange: { ...DEFAULT_SETTINGS.scanRange } };
}

/**
 * Fill in anything missing from a loaded config so the rest of the app can
 * assume `settings.mdnsDomain` etc. always exist.
 */
function normalize(raw) {
    const settings = { ...defaultSettings(), ...(raw && raw.settings) };
    settings.scanRange = { ...DEFAULT_SETTINGS.scanRange, ...settings.scanRange };

    const projects = Array.isArray(raw && raw.projects) ? raw.projects : [];
    for (const p of projects) {
        // Older versions sometimes stored the port as a string
        p.port = Number(p.port);
        if (p.id === undefined || p.id === null) p.id = crypto.randomUUID();
    }
    return { projects, settings };
}

/** Load projects.json (creating it if missing). Called once at startup. */
function init() {
    if (!fs.existsSync(CONFIG_FILE)) {
        state = normalize({});
        persist();
        log.info(`Created new config at ${CONFIG_FILE}`);
        return;
    }

    try {
        state = normalize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
    } catch (err) {
        // Don't silently overwrite a broken file - the user would lose their projects.
        const backup = `${CONFIG_FILE}.corrupt-${Date.now()}`;
        fs.copyFileSync(CONFIG_FILE, backup);
        log.error(`Could not parse ${CONFIG_FILE}: ${err.message}`);
        log.warn(`Backed it up to ${backup} and started with an empty config`);
        state = normalize({});
        persist();
    }
}

/** Atomically write the current state to disk. */
function persist() {
    const tmp = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, CONFIG_FILE);
    log.debug('Config saved');
}

/** Lazily initialise so callers never see a null state. */
function ensure() {
    if (!state) init();
    return state;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function getSettings() {
    return ensure().settings;
}

function getProjects() {
    return ensure().projects;
}

/** IDs may be numbers (old configs) or UUID strings; compare as strings. */
function getProject(id) {
    return getProjects().find(p => String(p.id) === String(id)) || null;
}

/** Find the project that owns a hostname such as "myapp" or "myapp.local". */
function findProjectByDomain(hostname) {
    const name = String(hostname || '').toLowerCase().replace(/\.local\.?$/, '');
    return getProjects().find(p => p.domain === name) || null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Make sure a domain/port combination doesn't clash with the dashboard or
 * another project. `selfId` is excluded so a project can keep its own values.
 */
function assertNoConflicts({ domain, port }, selfId = null) {
    const others = getProjects().filter(p => String(p.id) !== String(selfId));

    if (domain !== undefined) {
        if (domain === getSettings().mdnsDomain) {
            throw new ValidationError(`"${domain}" is the dashboard's own domain`, 409);
        }
        const clash = others.find(p => p.domain === domain);
        if (clash) throw new ValidationError(`Domain "${domain}" is already used by "${clash.name}"`, 409);
    }

    if (port !== undefined) {
        if (port === PORT) throw new ValidationError(`Port ${port} is used by the dashboard itself`, 409);
        const clash = others.find(p => p.port === port);
        if (clash) throw new ValidationError(`Port ${port} is already used by "${clash.name}"`, 409);
    }
}

/** Add a new project (input must already be validated). */
function addProject(fields) {
    assertNoConflicts(fields);
    const project = {
        id: crypto.randomUUID(),
        name: fields.name,
        port: fields.port,
        domain: fields.domain,
        path: fields.path || '',
        executable: fields.executable || '',
        enabled: true,
        createdAt: new Date().toISOString(),
    };
    getProjects().push(project);
    persist();
    return project;
}

/** Apply validated changes to an existing project. Returns null if not found. */
function updateProject(id, changes) {
    const project = getProject(id);
    if (!project) return null;
    assertNoConflicts(changes, id);
    Object.assign(project, changes, { updatedAt: new Date().toISOString() });
    persist();
    return project;
}

/** Remove a project. Returns the removed project, or null if not found. */
function deleteProject(id) {
    const projects = getProjects();
    const index = projects.findIndex(p => String(p.id) === String(id));
    if (index === -1) return null;
    const [removed] = projects.splice(index, 1);
    persist();
    return removed;
}

/** Merge validated settings changes. */
function updateSettings(changes) {
    if (changes.mdnsDomain && getProjects().some(p => p.domain === changes.mdnsDomain)) {
        throw new ValidationError(`"${changes.mdnsDomain}" is already used by a project`, 409);
    }
    Object.assign(getSettings(), changes);
    persist();
    return getSettings();
}

module.exports = {
    init,
    getSettings,
    getProjects,
    getProject,
    findProjectByDomain,
    addProject,
    updateProject,
    deleteProject,
    updateSettings,
};
