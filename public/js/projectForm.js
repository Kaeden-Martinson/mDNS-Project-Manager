/**
 * The "Add project" dialog: folder picker with start-command detection,
 * a live preview of the project's address, validation and saving.
 *
 * The domain follows the name as you type until you edit the domain yourself.
 * Command detection only looks at the folder's top level (not node_modules).
 */
import { api } from './api.js';
import { $, escapeHtml, slugify, projectUrl } from './utils.js';
import { showToast } from './ui/toast.js';
import { openModal, closeModal } from './ui/modal.js';
import { loadProjects } from './projectList.js';

const modal = () => $('projectModal');

/** True once the user has typed in the domain field themselves. */
let domainEditedByUser = false;

/** Show the address the project will get, in the dialog header. */
function updatePreview() {
    const domain = $('projectDomain').value.trim() || slugify($('projectName').value);
    $('modalPreviewUrl').textContent = domain ? projectUrl(domain) : 'http://—.local';
}

/** Highlight the suggestion chip matching the current command, if any. */
function syncSuggestionState() {
    const current = $('projectExecutable').value.trim();
    $('commandSuggestions').querySelectorAll('[data-command]').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.command === current);
    });
}

/** Reset and open the dialog, optionally pre-filled (used by the port scan). */
export function openProjectForm(prefill = {}, title = 'Add project') {
    domainEditedByUser = false;

    $('modalTitle').textContent = title;
    $('projectFilePicker').value = '';
    $('filePickerText').textContent = 'Choose the project folder';
    document.querySelector('.folder-pick').classList.remove('picked');
    $('commandSuggestions').innerHTML = '';
    $('commandSuggestionsBox').hidden = true;

    $('projectName').value = prefill.name || '';
    $('projectPort').value = prefill.port || '';
    $('projectPath').value = prefill.path || '';
    $('projectExecutable').value = prefill.executable || '';
    $('projectDomain').value = prefill.domain || slugify(prefill.name);
    updatePreview();

    openModal(modal());
}

/**
 * Top-level file names in the picked folder.
 * webkitRelativePath looks like "my-app/src/index.js"; top-level files have exactly 2 parts.
 */
function topLevelFiles(files) {
    return Array.from(files)
        .map(f => f.webkitRelativePath.split('/'))
        .filter(parts => parts.length === 2)
        .map(parts => parts[1].toLowerCase());
}

/** Likely start commands, based on the files in the folder root. */
function suggestCommands(fileNames) {
    const has = name => fileNames.includes(name);
    const firstOf = names => names.find(has);
    const suggestions = [];

    if (has('package.json')) suggestions.push('npm run dev', 'npm start');
    const js = firstOf(['server.js', 'app.js', 'index.js', 'main.js', 'start.js']);
    if (js) suggestions.push(`node ${js}`);

    const py = firstOf(['manage.py', 'app.py', 'main.py', 'server.py', 'run.py']);
    if (py === 'manage.py') suggestions.push('python manage.py runserver');
    else if (py) suggestions.push(`python ${py}`);

    const script = firstOf(['start.bat', 'run.bat', 'start.cmd', 'run.cmd', 'start.sh', 'run.sh']);
    if (script) suggestions.push(script);

    return [...new Set(suggestions)];
}

/** Folder picker change handler. */
function handleFolderSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Browsers never reveal the full path, only the folder's own name
    const folderName = files[0].webkitRelativePath.split('/')[0];
    $('filePickerText').textContent = folderName;
    document.querySelector('.folder-pick').classList.add('picked');

    if (!$('projectName').value) $('projectName').value = folderName;
    if (!domainEditedByUser) $('projectDomain').value = slugify($('projectName').value);
    updatePreview();

    const suggestions = suggestCommands(topLevelFiles(files));
    $('commandSuggestionsBox').hidden = suggestions.length === 0;
    $('commandSuggestions').innerHTML = suggestions
        .map(cmd => `<button type="button" class="suggestion" data-command="${escapeHtml(cmd)}">${escapeHtml(cmd)}</button>`)
        .join('');

    if (!$('projectExecutable').value && suggestions.length > 0) {
        $('projectExecutable').value = suggestions[0];
    }
    syncSuggestionState();

    if (suggestions.length === 0) {
        showToast('No package.json, server.js or app.py at the top of that folder. Enter the start command yourself.', 'warning', 6000);
    }
    $('projectPath').focus();
}

/** Validate and submit. */
async function handleSave(e) {
    e.preventDefault();

    const name = $('projectName').value.trim();
    const port = Number($('projectPort').value);
    const path = $('projectPath').value.trim();
    const executable = $('projectExecutable').value.trim();
    const domain = $('projectDomain').value.trim() || slugify(name);

    const missing = [
        !name && 'name',
        !port && 'port',
        !path && 'directory',
        !executable && 'start command',
    ].filter(Boolean);
    if (missing.length) {
        showToast(`Still needed: ${missing.join(', ')}`, 'error');
        return;
    }

    const saveBtn = $('saveProjectBtn');
    saveBtn.disabled = true;
    try {
        const project = await api.createProject({ name, port, domain, path, executable });
        closeModal(modal());
        showToast(`${project.name} is at ${project.domain}.local`, 'success');
        await loadProjects();
    } catch (err) {
        showToast(err.message, 'error', 6000);
    } finally {
        saveBtn.disabled = false;
    }
}

/** Wire up the dialog. Call once. */
export function initProjectForm() {
    $('addProjectBtn').addEventListener('click', () => openProjectForm());
    $('projectForm').addEventListener('submit', handleSave);
    $('projectFilePicker').addEventListener('change', handleFolderSelect);

    // Domain follows the name until the user overrides it
    $('projectName').addEventListener('input', () => {
        if (!domainEditedByUser) $('projectDomain').value = slugify($('projectName').value);
        updatePreview();
    });
    $('projectDomain').addEventListener('input', () => {
        // Clearing the field hands control back to the auto-fill
        domainEditedByUser = $('projectDomain').value.trim() !== '';
        updatePreview();
    });
    $('projectExecutable').addEventListener('input', syncSuggestionState);

    $('commandSuggestions').addEventListener('click', e => {
        const chip = e.target.closest('[data-command]');
        if (!chip) return;
        $('projectExecutable').value = chip.dataset.command;
        syncSuggestionState();
    });
}
