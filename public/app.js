// API Configuration - Dynamic based on where the page was accessed from
const API_BASE = `http://${window.location.hostname}/api`;

// Detect if accessing from a remote machine
function detectRemoteConnection() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const isLocal = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname === 'myprojects' || hostname.endsWith('.local');
    
    // If not localhost and appears to be a remote IP, show banner
    if (!isLocalhost && isLocal && hostname.match(/\d+\.\d+\.\d+\.\d+/)) {
        // This is likely a direct IP access from another machine
        // Make a test request to check for remote flag
        fetch(`/api/projects`)
            .then(r => {
                const isRemote = r.headers.get('X-Remote-Connection') === 'true';
                if (isRemote) {
                    const banner = document.getElementById('remoteBanner');
                    if (banner) {
                        banner.style.display = 'flex';
                    }
                }
            })
            .catch(() => {});
    }
}

// State
let projects = [];
let currentEditingId = null;
let selectedFilePath = '';
let updatingProjects = new Set(); // Track projects being updated
let lastUpdateTime = null; // Track last update time

// SVG Icons
const SVG_SUCCESS = '<svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_ERROR = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8V12M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_INFO = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16V12M12 8H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_WARNING = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2L2 20h20L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9V13M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// Toast Notification System
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let svgIcon;
    switch (type) {
        case 'success':
            svgIcon = SVG_SUCCESS;
            break;
        case 'error':
            svgIcon = SVG_ERROR;
            break;
        case 'warning':
            svgIcon = SVG_WARNING;
            break;
        default:
            svgIcon = SVG_INFO;
    }

    toast.innerHTML = `
        <div class="toast-icon">${svgIcon}</div>
        <div class="toast-content">${message}</div>
        <button class="toast-close" onclick="removeToast(this.parentElement)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6L18 18"/>
            </svg>
        </button>
    `;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }

    return toast;
}

function removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(() => {
        toast.remove();
    }, 300);
}

// DOM Elements
const projectModal = document.getElementById('projectModal');
const settingsModal = document.getElementById('settingsModal');
const scanModal = document.getElementById('scanModal');

const addProjectBtn = document.getElementById('addProjectBtn');
const settingsBtn = document.getElementById('settingsBtn');
const closeModal = document.getElementById('closeModal');
const closeSettings = document.getElementById('closeSettings');
const closeScanModal = document.getElementById('closeScanModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelBtn = document.getElementById('cancelBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');

const projectFilePicker = document.getElementById('projectFilePicker');
const filePickerText = document.getElementById('filePickerText');
const projectName = document.getElementById('projectName');
const projectDomain = document.getElementById('projectDomain');
const projectPort = document.getElementById('projectPort');
const projectPath = document.getElementById('projectPath');
const projectExecutable = document.getElementById('projectExecutable');
const commandSuggestions = document.getElementById('commandSuggestions');

const scanStart = document.getElementById('scanStart');
const scanEnd = document.getElementById('scanEnd');
const scanPortsBtn = document.getElementById('scanPortsBtn');
const projectsGrid = document.getElementById('projectsGrid');
const projectCount = document.getElementById('projectCount');
const runningCount = document.getElementById('runningCount');

// Event Listeners
addProjectBtn.addEventListener('click', openProjectModal);
settingsBtn.addEventListener('click', () => toggleModal(settingsModal));
closeModal.addEventListener('click', () => toggleModal(projectModal));
closeSettings.addEventListener('click', () => toggleModal(settingsModal));
closeScanModal.addEventListener('click', () => toggleModal(scanModal));
closeSettingsBtn.addEventListener('click', () => toggleModal(settingsModal));
cancelBtn.addEventListener('click', () => toggleModal(projectModal));
saveProjectBtn.addEventListener('click', handleSaveProject);

projectFilePicker.addEventListener('change', handleFileSelect);
scanPortsBtn.addEventListener('click', handleScanPorts);

// Auto-update domain when project name changes
projectName.addEventListener('input', () => {
    if (!projectDomain.value || projectDomain.value === '') {
        projectDomain.value = projectName.value.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/^-+|-+$/g, '');
    }
});

// Modal Management
function toggleModal(modal) {
    modal.classList.toggle('active');
}

function openProjectModal(projectId = null) {
    currentEditingId = projectId;
    selectedFilePath = '';

    // Reset form
    projectFilePicker.value = '';
    filePickerText.textContent = 'Click to select project folder';
    projectName.value = '';
    projectDomain.value = '';
    projectPort.value = '';
    projectPath.value = '';
    projectExecutable.value = '';
    commandSuggestions.innerHTML = '';

    if (projectId) {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            document.getElementById('modalTitle').textContent = 'Edit Project';
            projectName.value = project.name;
            projectDomain.value = project.domain;
            projectPort.value = project.port;
            projectPath.value = project.path;
            projectExecutable.value = project.executable;
        }
    } else {
        document.getElementById('modalTitle').textContent = 'New Project';
    }

    // Auto-close settings modal if open
    if (settingsModal.classList.contains('active')) {
        toggleModal(settingsModal);
    }

    toggleModal(projectModal);
}

// Helper function to extract domain from directory path
function extractDomainFromPath(dirPath) {
    if (!dirPath) return '';
    const lastPart = dirPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    return lastPart.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/^-+|-+$/g, '');
}

// Extract directory path from FileList (webkitdirectory)
function getDirectoryPathFromFileList(files) {
    if (!files || files.length === 0) return '';

    // Get the first file's webkitRelativePath and extract the folder path
    const firstFile = files[0];
    if (firstFile.webkitRelativePath) {
        const parts = firstFile.webkitRelativePath.split('/');
        // Remove the filename, get just the folder path
        const folderName = parts[0]; // The root folder that was selected
        return folderName;
    }
    return '';
}

// Find common server files in the folder
function findServerFiles(files) {
    const fileList = Array.from(files).map(f => f.name.toLowerCase());

    // Define common entry point files by type
    const serverFiles = {
        'js': ['server.js', 'app.js', 'index.js', 'main.js', 'start.js'],
        'py': ['app.py', 'main.py', 'server.py', 'run.py', 'wsgi.py'],
        'bat': ['start.bat', 'run.bat'],
        'cmd': ['start.cmd', 'run.cmd'],
    };

    const found = {};

    for (const [type, names] of Object.entries(serverFiles)) {
        const match = fileList.find(f => names.map(n => n.toLowerCase()).includes(f));
        if (match) {
            found[type] = match;
        }
    }

    return found;
}

// File/Folder Picker Handler
async function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length === 0) return;

    // Extract folder info from webkitdirectory
    const folderName = getDirectoryPathFromFileList(files);
    selectedFilePath = folderName;

    // Update UI
    filePickerText.textContent = `📂 ${folderName}`;

    // Find potential server files
    const serverFiles = findServerFiles(files);
    const hasServerFiles = Object.keys(serverFiles).length > 0;

    if (!hasServerFiles) {
        showToast('No common server files found.\nNode.js: server.js, app.js, index.js\nPython: app.py, main.py, server.py', 'warning', 6000);
    }

    // Auto-generate project name from folder name
    if (!projectName.value) {
        projectName.value = folderName;
    }

    // Auto-fill domain name to be same as project name (if not already set)
    if (!projectDomain.value) {
        projectDomain.value = projectName.value.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/^-+|-+$/g, '');
    }

    // Suggest commands based on found files
    const suggestions = [];

    if (serverFiles.js) {
        suggestions.push(`npm start`, `node ${serverFiles.js}`, `npm run dev`);
    }
    if (serverFiles.py) {
        suggestions.push(`python ${serverFiles.py}`, `python3 ${serverFiles.py}`);
    }
    if (serverFiles.bat || serverFiles.cmd) {
        const file = serverFiles.bat || serverFiles.cmd;
        suggestions.push(file, `cmd /c ${file}`);
    }

    // If no specific files found, show generic suggestions
    if (suggestions.length === 0) {
        suggestions.push('npm start', 'python app.py');
    }

    // Display suggestions
    commandSuggestions.innerHTML = suggestions
        .map(cmd => `<span class="suggestion-item" onclick="setSuggestion('${cmd.replace(/'/g, "\\'")}')"><code>${cmd}</code></span>`)
        .join('');

    // Set the first suggestion as default
    if (!projectExecutable.value && suggestions.length > 0) {
        projectExecutable.value = suggestions[0];
    }

    // Focus on path field for user to verify
    projectPath.focus();
    projectPath.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function suggestCommands(ext, fileName) {
    const suggestions = {
        'js': ['npm start', `node ${fileName}`, 'npm run dev'],
        'py': ['python app.py', `python ${fileName}`, 'python3 app.py'],
        'bat': [`${fileName}`, 'call start.bat'],
        'cmd': [`${fileName}`, 'cmd /c start.cmd'],
        'exe': [`${fileName}`, '.\\app.exe']
    };

    const cmds = suggestions[ext] || [`${fileName}`];
    commandSuggestions.innerHTML = cmds
        .map(cmd => `<span class="suggestion-item" onclick="setSuggestion('${cmd.replace(/'/g, "\\'")}')"><code>${cmd}</code></span>`)
        .join('');

    // Set the first suggestion as default
    if (!projectExecutable.value) {
        projectExecutable.value = cmds[0];
    }
}

function setSuggestion(cmd) {
    projectExecutable.value = cmd;
}

// Save Project Handler
async function handleSaveProject() {
    if (!projectName.value || !projectPort.value || !projectExecutable.value || !projectPath.value) {
        showToast('Please fill in all required fields (Name, Port, Path, and Command)', 'error');
        return;
    }

    // Use the entered path
    let path = projectPath.value.trim();
    if (!path) {
        showToast('Project directory path is required', 'error');
        return;
    }

    // Auto-generate domain from directory name if not manually set
    let domain = projectDomain.value.trim();
    if (!domain) {
        domain = extractDomainFromPath(path);
    }

    const formData = {
        name: projectName.value,
        port: parseInt(projectPort.value),
        domain: domain,
        path: path,
        executable: projectExecutable.value
    };

    try {
        let endpoint = '/projects';
        let method = 'POST';

        if (currentEditingId) {
            endpoint = `/projects/${currentEditingId}`;
            method = 'PUT';
        }

        const response = await fetch(API_BASE + endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            toggleModal(projectModal);
            currentEditingId = null;
            selectedFilePath = '';
            loadProjects();
            showToast('Project saved successfully', 'success');
        } else {
            showToast('Error saving project', 'error');
        }
    } catch (err) {
        console.error('Error saving project:', err);
        showToast('Error: ' + err.message, 'error');
    }
}
// Load Projects
async function loadProjects() {
    try {
        const response = await fetch(API_BASE + '/projects');
        projects = await response.json();
        renderProjects();
        updateStatusBar();
    } catch (err) {
        console.error('Error loading projects:', err);
    }
}

// Update Status Bar
function updateStatusBar() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const runningProjects = projects.filter(p => {
        const btn = document.getElementById(`start-btn-${p.id}`);
        return btn && btn.disabled; // If start is disabled, it's running
    }).length;

    projectCount.textContent = `${projects.length} project${projects.length !== 1 ? 's' : ''}`;
    runningCount.textContent = `${runningProjects} running — Updated ${timeStr}`;
}

// Render Projects
function renderProjects() {
    if (projects.length === 0) {
        projectsGrid.innerHTML = '<div class="empty-state"><p>No projects yet</p><p class="text-secondary">Click "New Project" to get started</p></div>';
        return;
    }

    projectsGrid.innerHTML = projects.map(project => `
        <div class="project-card" data-project-id="${project.id}">
            <!-- Header with title, details, and action buttons -->
            <div class="project-header" onclick="toggleProjectExpanded(${project.id})">
                <div class="project-info-main">
                    <div class="project-details-row">
                        <div class="project-name">${project.name}</div>
                        <div class="project-detail">
                            <span class="project-detail-label">Port:</span>
                            <span class="project-detail-value">${project.port}</span>
                        </div>
                        <div class="project-detail">
                            <span class="project-detail-label">Domain:</span>
                            <span class="project-detail-value">${project.domain}.local</span>
                        </div>
                        <div class="project-detail" id="status-${project.id}">
                            <span class="status-badge badge-offline">Checking...</span>
                        </div>
                    </div>
                </div>
                
                <div class="project-header-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-primary" onclick="openProjectInBrowser('${project.domain}')">Open</button>
                    <button class="btn btn-secondary" onclick="copyToClipboard('http://${project.domain}.local')">Copy</button>
                    <div class="expand-chevron" id="chevron-${project.id}">▼</div>
                </div>
            </div>
            
            <!-- Expanded section with details and controls -->
            <div class="project-expanded" id="expanded-${project.id}">
                <!-- Project Details Section -->
                <div class="expanded-section">
                    <div class="expanded-title">Project Details</div>
                    <div class="expanded-details">
                        <div class="detail-field">
                            <label>Name</label>
                            <input type="text" value="${project.name}" onchange="updateProjectField(${project.id}, 'name', this.value)">
                        </div>
                        <div class="detail-field">
                            <label>Domain</label>
                            <input type="text" value="${project.domain}" onchange="updateProjectField(${project.id}, 'domain', this.value)">
                        </div>
                        <div class="detail-field">
                            <label>Port</label>
                            <input type="number" value="${project.port}" onchange="updateProjectField(${project.id}, 'port', parseInt(this.value))">
                        </div>
                    </div>
                </div>
                
                <!-- Path and Command Section -->
                <div class="expanded-section">
                    <div class="expanded-title">Configuration</div>
                    <div class="expanded-details">
                        <div class="detail-field" style="grid-column: 1 / -1;">
                            <label>Directory</label>
                            <input type="text" value="${project.path}" onchange="updateProjectField(${project.id}, 'path', this.value)">
                        </div>
                        <div class="detail-field" style="grid-column: 1 / -1;">
                            <label>Command</label>
                            <input type="text" value="${project.executable}" onchange="updateProjectField(${project.id}, 'executable', this.value)">
                        </div>
                    </div>
                </div>
                
                <!-- Controls Section -->
                <div class="expanded-section">
                    <div class="expanded-title">Controls</div>
                    <div class="project-actions">
                        <button class="btn btn-success" id="start-btn-${project.id}" onclick="handleExecuteProject(${project.id})">Start</button>
                        <button class="btn btn-warning" id="stop-btn-${project.id}" onclick="handleStopProject(${project.id})" disabled>Stop</button>
                        <button class="btn btn-info" id="restart-btn-${project.id}" onclick="handleRestartProject(${project.id})" disabled>Restart</button>
                        <button class="btn btn-danger" onclick="handleDeleteProject(${project.id})" style="flex: 1;">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Check port status for each project
    projects.forEach(project => {
        checkPortStatus(project.id, project.port);
    });
}

// Toggle Project Expanded View
function toggleProjectExpanded(projectId) {
    const expanded = document.getElementById(`expanded-${projectId}`);
    const chevron = document.getElementById(`chevron-${projectId}`);
    expanded.classList.toggle('show');
    chevron.classList.toggle('expanded');
}

// Update Project Field
async function updateProjectField(projectId, field, value) {
    updatingProjects.add(projectId);

    // Show updating status
    const statusDiv = document.getElementById(`status-${projectId}`);
    if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-badge" style="background: rgba(251, 146, 60, 0.2); color: #fb9338;">Updating</span>';
    }

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value })
        });

        if (response.ok) {
            showToast('Field updated successfully', 'success', 2000);
            projects.find(p => p.id === projectId)[field] = value;
            updatingProjects.delete(projectId);
            loadProjects()
            setTimeout(() => {
                toggleProjectExpanded(projectId);
            }, 10);
        } else {
            showToast('Error updating project', 'error');
            updatingProjects.delete(projectId);
        }
    } catch (err) {
        console.error('Error updating project:', err);
        showToast('Error: ' + err.message, 'error');
        updatingProjects.delete(projectId);
    }
}

// Open Project in Browser
function openProjectInBrowser(domain) {
    window.open(`http://${domain}.local`, '_blank');
}

// Copy to Clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied to clipboard: ${text}`, 'success', 2000);
    }).catch(err => {
        console.error('Error copying:', err);
        showToast('Failed to copy to clipboard', 'error');
    });
}

// Stop Project (Kill Process)
async function handleStopProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    updatingProjects.add(projectId);
    const statusDiv = document.getElementById(`status-${projectId}`);
    if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-badge" style="background: rgba(251, 146, 60, 0.2); color: #fb9338;">Stopping</span>';
    }

    try {
        const response = await fetch(`${API_BASE}/stop/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            showToast(`Stopped: ${project.name}`, 'success');
            updatingProjects.delete(projectId);
            setTimeout(() => {
                checkPortStatus(projectId, project.port);
                renderProjects();
                updateStatusBar();
            }, 1000);
        } else {
            const error = await response.json();
            showToast(`Error: ${error.error}`, 'error');
            updatingProjects.delete(projectId);
        }
    } catch (err) {
        console.error('Error stopping project:', err);
        showToast(`Error: ${err.message}`, 'error');
        updatingProjects.delete(projectId);
    }
}

// Check Port Status and update button states
async function checkPortStatus(projectId, port) {
    try {
        // If this project is updating or restarting, show that status instead
        if (updatingProjects.has(projectId)) {
            const statusDiv = document.getElementById(`status-${projectId}`);
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="status-badge" style="background: rgba(251, 146, 60, 0.2); color: #fb9338;">Updating</span>';
            }
            return;
        }

        const response = await fetch(`${API_BASE}/port-status/${port}`);
        const data = await response.json();
        const statusDiv = document.getElementById(`status-${projectId}`);

        if (statusDiv) {
            if (data.isOpen) {
                statusDiv.innerHTML = '<span class="status-badge badge-online">Running</span>';
                // Enable stop/restart, disable start
                const startBtn = document.getElementById(`start-btn-${projectId}`);
                const stopBtn = document.getElementById(`stop-btn-${projectId}`);
                const restartBtn = document.getElementById(`restart-btn-${projectId}`);
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                if (restartBtn) restartBtn.disabled = false;
            } else {
                statusDiv.innerHTML = '<span class="status-badge badge-offline">Offline</span>';
                // Enable start, disable stop/restart
                const startBtn = document.getElementById(`start-btn-${projectId}`);
                const stopBtn = document.getElementById(`stop-btn-${projectId}`);
                const restartBtn = document.getElementById(`restart-btn-${projectId}`);
                if (startBtn) startBtn.disabled = false;
                if (stopBtn) stopBtn.disabled = true;
                if (restartBtn) restartBtn.disabled = true;
            }

            updateStatusBar();
        }
    } catch (err) {
        console.error('Error checking port status:', err);
    }
}

// Execute Project
async function handleExecuteProject(projectId) {
    const statusDiv = document.getElementById(`status-${projectId}`);
    if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-badge" style="background: rgba(251, 146, 60, 0.2); color: #fb9338;">Executing</span>';
    }

    try {
        const response = await fetch(`${API_BASE}/execute/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            showToast(`Started: ${data.message}`, 'success');
            setTimeout(() => {
                const project = projects.find(p => p.id === projectId);
                if (project) {
                    checkPortStatus(projectId, project.port);
                    updateStatusBar();
                }
            }, 2000);
        } else {
            const error = await response.json();
            showToast(`Error: ${error.error}`, 'error');
        }
    } catch (err) {
        console.error('Error executing project:', err);
        showToast(`Error: ${err.message}`, 'error');
    }
}

// Restart Project
async function handleRestartProject(projectId) {
    try {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        updatingProjects.add(projectId);
        const statusDiv = document.getElementById(`status-${projectId}`);
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="status-badge" style="background: rgba(251, 146, 60, 0.2); color: #fb9338;">Restarting</span>';
        }

        const response = await fetch(`${API_BASE}/restart/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            showToast(`Restarted: ${project.name}`, 'success');
            updatingProjects.delete(projectId);
            setTimeout(() => {
                checkPortStatus(projectId, project.port);
                renderProjects();
                updateStatusBar();
            }, 2000);
        } else {
            const error = await response.json();
            showToast(`Error: ${error.error}`, 'error');
            updatingProjects.delete(projectId);
        }
    } catch (err) {
        console.error('Error restarting project:', err);
        showToast(`Error: ${err.message}`, 'error');
        updatingProjects.delete(projectId);
    }
}

// Delete Project
async function handleDeleteProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    const response = confirm(`Delete project "${project.name}"? This cannot be undone.`);
    if (!response) {
        return;
    }

    try {
        const deleteResponse = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'DELETE'
        });

        if (deleteResponse.ok) {
            showToast(`Deleted: ${project.name}`, 'success');
            loadProjects();
        } else {
            showToast('Error deleting project', 'error');
        }
    } catch (err) {
        console.error('Error deleting project:', err);
        showToast(`Error: ${err.message}`, 'error');
    }
}

// Port Scanner
async function handleScanPorts() {
    const start = parseInt(scanStart.value) || 3000;
    const end = parseInt(scanEnd.value) || 9999;

    const scanResults = document.getElementById('scanResults');
    scanResults.innerHTML = `<div style="text-align: center; padding: 2rem; color: #cbd5e1;">Scanning ports ${start}-${end}...</div>`;
    toggleModal(scanModal);

    try {
        const response = await fetch(`${API_BASE}/scan-ports?start=${start}&end=${end}`);
        const data = await response.json();

        if (data.portsWithInfo && data.portsWithInfo.length > 0) {
            scanResults.innerHTML = data.portsWithInfo.map(item => {
                const port = item.port;
                const procInfo = item.processInfo;
                const displayName = procInfo?.name ? procInfo.name.toUpperCase() : `Process ${port}`;
                const displayPath = procInfo?.directory ? procInfo.directory : '(Unknown)';
                
                // Check if this port already has a project
                const existingProject = projects.find(p => p.port === port);
                const existingClass = existingProject ? 'existing' : '';

                return `
                    <div class="scan-result-item ${existingClass}">
                        <div class="scan-result-port">
                            <div class="port-number">Port ${port}</div>
                            <div class="process-info">${displayName}</div>
                            <div class="process-info" style="font-size: 0.75rem; opacity: 0.7;">${displayPath}</div>
                        </div>
                        <div class="scan-result-actions">
                            <button class="btn ${existingProject ? 'btn-secondary' : 'btn-primary'} btn-small" onclick="quickAddProject(${port}, '${displayName.replace(/'/g, "\\'")}', '${displayPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" ${existingProject ? 'disabled' : ''}>
                                ${existingProject ? 'Already Added' : '+ Add'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            showToast(`Found ${data.portsWithInfo.length} open port${data.portsWithInfo.length !== 1 ? 's' : ''}`, 'info', 2000);
        } else {
            scanResults.innerHTML = '<div style="text-align: center; padding: 2rem; color: #cbd5e1;">No open ports found.</div>';
            showToast('No open ports found in the specified range', 'info', 3000);
        }
    } catch (err) {
        console.error('Error scanning ports:', err);
        scanResults.innerHTML = `<div style="text-align: center; padding: 2rem; color: #ef4444;">Error: ${err.message}</div>`;
        showToast(`Scan error: ${err.message}`, 'error');
    }
}

// Quick Add Project from Scan
function quickAddProject(port, suggestedName, suggestedPath) {
    projectName.value = suggestedName || `Project ${port}`;
    projectPort.value = port;
    projectPath.value = suggestedPath || '';
    // Auto-generate domain from project name (same as project name)
    projectDomain.value = projectName.value.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/^-+|-+$/g, '');
    projectExecutable.value = '';

    document.getElementById('modalTitle').textContent = 'Add Project from Scan';
    currentEditingId = null;
    toggleModal(scanModal);
    toggleModal(projectModal);
}

// Initialize
function init() {
    // Check if accessing from a remote machine
    detectRemoteConnection();
    
    loadProjects();
    
    setTimeout(() => {
        updateStatusBar();
    }, 50);

    // Auto-refresh project status every 10 seconds
    setInterval(() => {
        updateStatusBar();
        projects.forEach(project => {
            checkPortStatus(project.id, project.port);
        });
    }, 10000);
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
