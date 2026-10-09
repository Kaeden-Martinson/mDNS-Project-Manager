/**
 * The Projects view: a table with one row per project. Clicking a row opens
 * an inline detail panel with editable fields, Start/Stop/Restart, logs and
 * delete.
 *
 * All controls use data-action attributes handled by one delegated listener,
 * so no user data ever ends up inside an inline onclick="..." string.
 */
import { api } from './api.js';
import { state, findProject } from './state.js';
import { $, escapeHtml, projectUrl, copyText } from './utils.js';
import { icon } from './ui/icons.js';
import { showToast } from './ui/toast.js';

const body = () => $('projectsBody');

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** One project: the summary row plus its (hidden until opened) detail panel. */
function projectHtml(p) {
    const id = escapeHtml(p.id);
    const key = String(p.id);
    const open = state.expanded.has(key);
    const logsOpen = state.logsOpen.has(key);
    const url = projectUrl(p.domain);

    return `
    <div class="project ${open ? 'open' : ''}" data-id="${id}">
        <div class="tr project-row" data-action="toggle" role="button" tabindex="0" aria-expanded="${open}">
            <div class="t">
                <b data-ref="name">${escapeHtml(p.name)}</b>
                <span class="mono" data-ref="path" title="${escapeHtml(p.path)}">${escapeHtml(p.path || 'No directory set')}</span>
            </div>
            <div class="addr">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener" data-ref="url" data-action="link">${escapeHtml(p.domain)}.local</a>
                <button class="icon-btn sm" data-action="copy" aria-label="Copy address" title="Copy address">${icon('copy', 14)}</button>
            </div>
            <div class="num mono" data-ref="port">${escapeHtml(p.port)}</div>
            <div data-ref="status"></div>
            <div class="row-acts">
                <button class="icon-btn" data-action="power" data-ref="power" aria-label="Start">${icon('play')}</button>
                <button class="icon-btn" data-action="open" aria-label="Open in new tab" title="Open in new tab">${icon('external')}</button>
                <span class="icon-btn chev" aria-hidden="true">${icon('chevron')}</span>
            </div>
        </div>

        <div class="detail">
            <div class="detail-grid">
                ${fieldHtml('Name', 'name', p.name)}
                ${fieldHtml('Domain', 'domain', p.domain, { mono: true, suffix: '.local' })}
                ${fieldHtml('Port', 'port', p.port, { type: 'number', mono: true })}
                ${fieldHtml('Directory', 'path', p.path, { mono: true, span: true })}
                ${fieldHtml('Start command', 'executable', p.executable, { mono: true, span: true })}
            </div>
            <div class="detail-bar">
                <button class="btn sm go" data-action="start">${icon('play', 14)}Start</button>
                <button class="btn sm" data-action="stop">${icon('stop', 14)}Stop</button>
                <button class="btn sm" data-action="restart">${icon('restart', 14)}Restart</button>
                <button class="btn sm" data-action="logs" aria-pressed="${logsOpen}">${icon('terminal', 14)}<span>${logsOpen ? 'Hide output' : 'Output'}</span></button>
                <span class="spacer"></span>
                <button class="btn sm danger" data-action="delete">${icon('trash', 14)}Delete</button>
            </div>
            <pre class="logs" data-ref="logs" ${logsOpen ? '' : 'hidden'}></pre>
        </div>
    </div>`;
}

/** A labelled inline-edit input. Changes save on blur/Enter. */
function fieldHtml(label, field, value, { type = 'text', mono = false, suffix = '', span = false } = {}) {
    const input = `<input type="${type}" data-field="${field}" value="${escapeHtml(value)}"
        class="${mono ? 'mono' : ''}" spellcheck="false" autocomplete="off"
        ${type === 'number' ? 'min="1" max="65535"' : ''}>`;
    return `
        <label class="field ${span ? 'span-all' : ''}">
            <span>${label}</span>
            ${suffix ? `<span class="domain-field">${input}<span class="suffix mono">${suffix}</span></span>` : input}
        </label>`;
}

/** Shown instead of the table body when nothing is registered yet. */
function emptyHtml() {
    return `
        <div class="empty">
            <b>No projects yet</b>
            <p>Register a local server to give it a .local address you can open from your phone or another computer. If it's already running, a port scan will find it.</p>
            <div class="acts">
                <button class="btn primary sm" data-action="add">${icon('plus', 14)}Add project</button>
                <a class="btn sm" href="#scan">${icon('scan', 14)}Scan ports</a>
            </div>
        </div>`;
}

/** Re-render the whole table. Open rows and log panels survive via `state`. */
export function renderProjects() {
    if (state.projects.length === 0) {
        body().innerHTML = emptyHtml();
    } else {
        body().innerHTML = state.projects.map(projectHtml).join('');
        state.projects.forEach(p => {
            updateRowStatus(p.id);
            if (state.logsOpen.has(String(p.id))) loadLogs(p.id);
        });
    }
    updateSummary();
}

/** The .project element for an id. */
function rowFor(id) {
    return body().querySelector(`.project[data-id="${CSS.escape(String(id))}"]`);
}

/** Status pill + which controls are enabled, from `state`. */
function updateRowStatus(id) {
    const row = rowFor(id);
    if (!row) return;

    const key = String(id);
    const busyLabel = state.busy.get(key);
    const status = state.statuses.get(key);
    const running = Boolean(status && status.running);
    const busy = Boolean(busyLabel);

    let pill;
    if (busyLabel) pill = `<span class="pill warn"><span class="dot"></span>${escapeHtml(busyLabel)}</span>`;
    else if (!status) pill = '<span class="pill muted">Checking</span>';
    else if (running) pill = '<span class="pill ok"><span class="dot"></span>Running</span>';
    else pill = '<span class="pill muted"><span class="dot"></span>Stopped</span>';
    row.querySelector('[data-ref="status"]').innerHTML = pill;

    // Quick start/stop toggle in the row
    const power = row.querySelector('[data-ref="power"]');
    const label = running ? 'Stop' : 'Start';
    if (power.getAttribute('aria-label') !== label || power.disabled !== busy) {
        power.innerHTML = icon(running ? 'stop' : 'play');
        power.setAttribute('aria-label', label);
        power.title = label;
        power.className = `icon-btn ${running ? 'halt' : 'go'}`;
        power.disabled = busy;
    }

    row.querySelector('[data-action="start"]').disabled = busy || running;
    row.querySelector('[data-action="stop"]').disabled = busy || !running;
    row.querySelector('[data-action="restart"]').disabled = busy || !running;
    row.querySelector('[data-action="delete"]').disabled = busy;
}

/** Summary strip, nav counter. */
function updateSummary() {
    const total = state.projects.length;
    const running = state.projects.filter(p => state.statuses.get(String(p.id))?.running).length;

    $('navCount').textContent = total || '';
    $('sumRunning').innerHTML = total ? `${running} <small>of ${total}</small>` : '0';
    $('sumRunningNote').textContent = total === 0
        ? 'Nothing registered yet'
        : running === total ? 'Everything is up' : `${total - running} stopped`;
    $('sumChecked').textContent = state.lastUpdated
        ? state.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/** Fetch the project list and re-render. */
export async function loadProjects() {
    try {
        state.projects = await api.listProjects();
        renderProjects();
        await refreshStatuses();
    } catch (err) {
        body().innerHTML = `<div class="scan-msg error">Could not load projects: ${escapeHtml(err.message)}</div>`;
    }
}

/** Fetch running state for all projects in one request and patch rows in place. */
export async function refreshStatuses() {
    try {
        const statuses = await api.projectStatuses();
        state.statuses = new Map(statuses.map(s => [String(s.id), s]));
        state.lastUpdated = new Date();
        state.projects.forEach(p => updateRowStatus(p.id));
        updateSummary();
    } catch (err) {
        console.error('Status refresh failed:', err);
    }
}

/** Load the tail of a project's log file into its panel. */
async function loadLogs(id) {
    const row = rowFor(id);
    if (!row) return;
    const pre = row.querySelector('[data-ref="logs"]');
    try {
        const text = await api.projectLogs(id);
        pre.textContent = text.trim() || 'No output yet. Start the project to create its log.';
        pre.scrollTop = pre.scrollHeight;
    } catch (err) {
        pre.textContent = `Could not load output: ${err.message}`;
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Start/stop/restart: show a busy pill, call the API, then re-check status
 * after a short delay (dev servers often take a moment to bind their port).
 */
async function runAction(project, label, apiCall, successMessage) {
    const key = String(project.id);
    state.busy.set(key, label);
    updateRowStatus(project.id);
    try {
        await apiCall(project.id);
        showToast(successMessage, 'success');
    } catch (err) {
        showToast(err.message, 'error', 6000);
    } finally {
        state.busy.delete(key);
        setTimeout(async () => {
            await refreshStatuses();
            if (state.logsOpen.has(key)) loadLogs(project.id);
        }, 1500);
        updateRowStatus(project.id);
    }
}

const actions = {
    toggle(project, row) {
        const key = String(project.id);
        const open = !state.expanded.has(key);
        open ? state.expanded.add(key) : state.expanded.delete(key);
        row.classList.toggle('open', open);
        row.querySelector('.project-row').setAttribute('aria-expanded', open);
    },

    // Let the browser follow the link; just don't toggle the row
    link() {},

    open(project) {
        window.open(projectUrl(project.domain), '_blank', 'noopener');
    },

    async copy(project) {
        const url = projectUrl(project.domain);
        try {
            await copyText(url);
            showToast(`Copied ${url}`, 'success', 2000);
        } catch {
            showToast('Could not copy to the clipboard', 'error');
        }
    },

    power(project) {
        const running = state.statuses.get(String(project.id))?.running;
        return running ? actions.stop(project) : actions.start(project);
    },

    start: p => runAction(p, 'Starting', api.startProject, `Started ${p.name}`),
    stop: p => runAction(p, 'Stopping', api.stopProject, `Stopped ${p.name}`),
    restart: p => runAction(p, 'Restarting', api.restartProject, `Restarted ${p.name}`),

    logs(project, row, button) {
        const key = String(project.id);
        const show = !state.logsOpen.has(key);
        show ? state.logsOpen.add(key) : state.logsOpen.delete(key);
        row.querySelector('[data-ref="logs"]').hidden = !show;
        button.setAttribute('aria-pressed', show);
        button.querySelector('span').textContent = show ? 'Hide output' : 'Output';
        if (show) loadLogs(project.id);
    },

    async delete(project) {
        const running = state.statuses.get(String(project.id))?.running;
        const note = running ? '\n\nIt is running and will be stopped first.' : '';
        if (!confirm(`Delete "${project.name}"? This cannot be undone.${note}`)) return;
        try {
            await api.deleteProject(project.id, { stop: Boolean(running) });
            state.expanded.delete(String(project.id));
            state.logsOpen.delete(String(project.id));
            showToast(`Deleted ${project.name}`, 'success');
            await loadProjects();
        } catch (err) {
            showToast(err.message, 'error');
        }
    },
};

/** Save one inline-edited field, then patch the summary row in place. */
async function saveField(project, input) {
    const field = input.dataset.field;
    const value = field === 'port' ? Number(input.value) : input.value.trim();
    if (String(value) === String(project[field] ?? '')) return; // unchanged

    try {
        const updated = await api.updateProject(project.id, { [field]: value });
        Object.assign(project, updated);

        const row = rowFor(project.id);
        const url = projectUrl(updated.domain);
        row.querySelector('[data-ref="name"]').textContent = updated.name;
        row.querySelector('[data-ref="path"]').textContent = updated.path || 'No directory set';
        row.querySelector('[data-ref="path"]').title = updated.path;
        row.querySelector('[data-ref="port"]').textContent = updated.port;
        row.querySelector('[data-ref="url"]').textContent = `${updated.domain}.local`;
        row.querySelector('[data-ref="url"]').href = url;
        input.value = updated[field]; // show the normalised value (e.g. lowercased domain)

        showToast('Saved', 'success', 1500);
        if (field === 'port') refreshStatuses();
    } catch (err) {
        input.value = project[field] ?? ''; // revert to the last saved value
        showToast(err.message, 'error');
    }
}

/** Attach delegated listeners to the table. Call once. */
export function initProjectList({ onAdd }) {
    body().addEventListener('click', e => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        if (target.dataset.action === 'add') return onAdd();

        const row = target.closest('.project');
        const project = row && findProject(row.dataset.id);
        if (!project) return;

        // A button inside the summary row shouldn't also expand/collapse it
        if (target.dataset.action !== 'toggle') e.stopPropagation();
        actions[target.dataset.action]?.(project, row, target);
    });

    // Keyboard: Enter/Space on a focused summary row toggles it
    body().addEventListener('keydown', e => {
        if (e.target.matches('.project-row') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.target.click();
        } else if (e.key === 'Enter' && e.target.matches('input[data-field]')) {
            e.target.blur(); // fires 'change', which saves
        }
    });

    body().addEventListener('change', e => {
        const input = e.target.closest('input[data-field]');
        if (!input) return;
        const project = findProject(input.closest('.project').dataset.id);
        if (project) saveField(project, input);
    });
}
