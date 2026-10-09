/**
 * The Port scan and Settings views.
 *
 * The scan range is saved to projects.json whenever a scan runs, so it is
 * remembered between visits. Settings currently holds the dashboard's own
 * .local name.
 */
import { api } from './api.js';
import { state } from './state.js';
import { $, escapeHtml, projectUrl } from './utils.js';
import { icon } from './ui/icons.js';
import { showToast } from './ui/toast.js';
import { openProjectForm } from './projectForm.js';

/** Push `state.settings` into every place it is displayed. */
function populateSettings() {
    const s = state.settings;
    if (!s) return;
    $('scanStart').value = s.scanRange.start;
    $('scanEnd').value = s.scanRange.end;
    $('mdnsDomain').value = s.mdnsDomain;
    document.querySelectorAll('[data-ref="dashboard-domain"]').forEach(el => { el.textContent = `${s.mdnsDomain}.local`; });
    document.querySelectorAll('[data-ref="dashboard-url"]').forEach(el => { el.textContent = projectUrl(s.mdnsDomain); });
    if (s.localIP) document.querySelectorAll('[data-ref="host-ip"]').forEach(el => { el.textContent = s.localIP; });
}

/** Load settings from the server. */
export async function loadSettings() {
    try {
        state.settings = await api.getConfig();
        populateSettings();
    } catch (err) {
        showToast(`Could not load settings: ${err.message}`, 'error');
    }
}

/** Save a partial settings change. Returns false if the server rejected it. */
async function saveSettings(changes) {
    try {
        state.settings = { ...state.settings, ...(await api.updateConfig(changes)) };
        populateSettings();
        return true;
    } catch (err) {
        showToast(err.message, 'error');
        return false;
    }
}

/** One result row. Ports already registered link to their project instead of offering Add. */
function resultHtml({ port, processInfo }) {
    const existing = state.projects.find(p => p.port === port);
    const name = processInfo?.name || 'Unknown process';
    const cmd = processInfo?.cmd || '';
    const action = existing
        ? `<em>Registered as ${escapeHtml(existing.name)}</em>`
        : `<button class="btn sm" data-port="${port}" data-name="${escapeHtml(processInfo?.name || '')}">${icon('plus', 14)}Add</button>`;

    return `
        <div class="tr">
            <div class="num mono">${port}</div>
            <div class="t">
                <b>${escapeHtml(name)}</b>
                <span class="mono" title="${escapeHtml(cmd)}">${escapeHtml(cmd || '—')}</span>
            </div>
            <div class="num mono">${escapeHtml(processInfo?.pid ?? '—')}</div>
            <div class="acts-r">${action}</div>
        </div>`;
}

/** Skeleton rows shown while a scan is in progress. */
function skeletonHtml(rows = 4) {
    return Array.from({ length: rows }, () =>
        '<div class="tr skeleton-row"><i style="width:40px;justify-self:end"></i><i></i><i style="width:40px;justify-self:end"></i><i style="width:56px;justify-self:end"></i></div>'
    ).join('');
}

/** Run a scan with the range in the form. */
async function handleScan(e) {
    e.preventDefault();
    const start = Number($('scanStart').value);
    const end = Number($('scanEnd').value);
    if (!(await saveSettings({ scanRange: { start, end } }))) return;

    const button = $('scanPortsBtn');
    const results = $('scanResults');
    button.disabled = true;
    $('scanTable').hidden = false;
    $('scanNote').textContent = `Scanning ${end - start + 1} ports…`;
    results.innerHTML = skeletonHtml();

    const started = performance.now();
    try {
        const { portsWithInfo = [] } = await api.scanPorts(start, end);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        $('scanNote').textContent = `${portsWithInfo.length} open in ${start}–${end} · ${seconds}s`;
        results.innerHTML = portsWithInfo.length
            ? portsWithInfo.map(resultHtml).join('')
            : '<div class="scan-msg">Nothing is listening in this range.</div>';
    } catch (err) {
        $('scanNote').textContent = 'Scan failed';
        results.innerHTML = `<div class="scan-msg error">${escapeHtml(err.message)}</div>`;
    } finally {
        button.disabled = false;
    }
}

/** Wire up both views. Call once. */
export function initScanner() {
    $('scanForm').addEventListener('submit', handleScan);

    $('settingsForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (await saveSettings({ mdnsDomain: $('mdnsDomain').value.trim() })) {
            showToast(`Dashboard is now at ${state.settings.mdnsDomain}.local`, 'success');
        }
    });

    // "Add" on a result opens the dialog pre-filled with the port and process name
    $('scanResults').addEventListener('click', e => {
        const btn = e.target.closest('button[data-port]');
        if (!btn) return;
        const port = Number(btn.dataset.port);
        const processName = btn.dataset.name.replace(/\.[a-z]+$/i, ''); // "node.exe" -> "node"
        openProjectForm({ name: processName ? `${processName}-${port}` : `project-${port}`, port }, 'Add from scan');
    });
}
