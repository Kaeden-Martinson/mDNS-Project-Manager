/**
 * Frontend entry point: draws the icons, handles view switching from the
 * URL hash (#projects, #scan, #settings), wires every module and starts
 * status polling.
 */
import { api } from './api.js';
import { $ } from './utils.js';
import { hydrateIcons } from './ui/icons.js';
import { initModals } from './ui/modal.js';
import { initProjectList, loadProjects, refreshStatuses } from './projectList.js';
import { initProjectForm, openProjectForm } from './projectForm.js';
import { initScanner, loadSettings } from './scanner.js';

/** How often the running/stopped pills are refreshed. */
const STATUS_POLL_MS = 5000;

const VIEWS = ['projects', 'scan', 'settings'];

/** Show the view named in the URL hash and highlight its nav item. */
function showView() {
    const name = location.hash.slice(1);
    const view = VIEWS.includes(name) ? name : 'projects';
    VIEWS.forEach(v => { $(`view-${v}`).hidden = v !== view; });
    document.querySelectorAll('.nav-item').forEach(a => {
        const active = a.dataset.view === view;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
}

/**
 * Show the "another device" notice. The server sets X-Remote-Connection on
 * responses to clients that aren't this machine.
 */
async function detectRemoteConnection() {
    try {
        const { response } = await api.request('/config');
        if (response.headers.get('X-Remote-Connection') === 'true') $('remoteBanner').hidden = false;
    } catch {
        /* not important */
    }
}

function init() {
    hydrateIcons();
    initModals();
    initProjectList({ onAdd: () => openProjectForm() });
    initProjectForm();
    initScanner();

    showView();
    window.addEventListener('hashchange', showView);

    $('remoteBannerClose').addEventListener('click', () => { $('remoteBanner').hidden = true; });

    loadSettings();
    loadProjects();
    detectRemoteConnection();

    // Poll only while the tab is visible, and catch up as soon as it returns
    setInterval(() => { if (!document.hidden) refreshStatuses(); }, STATUS_POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatuses(); });
}

// Module scripts are deferred, so the DOM is already parsed here
init();
