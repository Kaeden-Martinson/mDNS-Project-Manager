const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const portUsed = require('tcp-port-used');
const mdns = require('multicast-dns');
const find = require('find-process');
const { exec, execSync } = require('child_process');
const httpProxy = require('http-proxy');
const os = require('os');
const Logger = require('./utils/logger');

const log = new Logger('SERVER');

const app = express();
const PORT = 80; // Default HTTP port
const CONFIG_FILE = path.join(__dirname, 'projects.json');

// Create HTTP proxy
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ws: true // Enable WebSocket support
});

// Proxy error handling
proxy.on('error', (err, req, res) => {
    log.error(`Proxy error: ${err.message}`);
    res.status(502).json({ error: `Proxy error: ${err.message}` });
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(async (req, res, next) => {
    const host = req.get('host') || '';
    const localIP = getLocalIP();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const config = loadProjects();

    // Check if this is a remote connection
    const isRemote = clientIP !== '127.0.0.1' && clientIP !== 'localhost' && clientIP !== localIP && !clientIP.includes('::ffff:127') && !clientIP.includes('::1');
    
    if (isRemote) {
        res.set('X-Remote-Connection', 'true');
    }
    
    // Extract domain, removing port if present
    let domain = host.split(':')[0]; // Remove port first
    
    // If it's just the IP or a dashboard domain, serve the dashboard
    if (domain === 'localhost' || domain === '127.0.0.1' || domain === localIP || domain === config.settings.mdnsDomain || domain === `${config.settings.mdnsDomain}.local`) {
        // If this is a remote connection to the IP, inject a warning banner
        if (isRemote && (domain === localIP)) {
            return express.static(path.join(__dirname, 'public'), {
                setHeaders: (res, path, stat) => {
                    if (path.endsWith('index.html')) {
                        res.set('Content-Type', 'text/html; charset=utf-8');
                    }
                }
            })(req, res, next);
        }
        
        return express.static(path.join(__dirname, 'public'))(req, res, next);
    }

    return next();
});

// Domain-based routing middleware
app.use(async (req, res, next) => {
    const host = req.get('host') || '';
    const localIP = getLocalIP();
    const config = loadProjects();
    
    // Extract domain, removing port if present
    let domain = host.split(':')[0]; // Remove port first
    
    // Skip routing for localhost, IP addresses, and dashboard domains
    if (domain === 'localhost' || domain === '127.0.0.1' || domain === localIP || domain === config.settings.mdnsDomain || domain === `${config.settings.mdnsDomain}.local` || !domain) {
        return next();
    }

    try {
        const config = loadProjects();
        const project = config.projects.find(p => {
            // Check if domain matches, handle both with and without .local
            const projectDomain = p.domain;
            return domain === projectDomain || domain === `${projectDomain}.local`;
        });

        if (project) {
            // Check if the project is actually running
            try {
                const isRunning = await portUsed.check(project.port, '127.0.0.1');

                if (isRunning) {
                    // Proxy the request to the project using actual network IP
                    return proxy.web(req, res, { target: `http://${localIP}:${project.port}` });
                } else {
                    log.warn(`Project "${project.name}" not running on port ${project.port}. Showing dashboard.`);
                    // Project not running, show dashboard
                    return next();
                }
            } catch (err) {
                log.warn(`Port check error for port ${project.port}: ${err.message}. Showing dashboard.`);
                return next();
            }
        } else {
            log.info(`No project found for domain "${domain}". Showing dashboard.`);
            return next();
        }
    } catch (err) {
        log.error(`Error in routing middleware: ${err.message}`);
        return next();
    }
});

// Initialize config file if it doesn't exist
function initializeConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = {
            projects: [],
            settings: {
                mdnsDomain: config.settings.mdnsDomain,
                scanRange: { start: 3000, end: 9999 }
            }
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    }
}

// Load projects from config
function loadProjects() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading config:', err);
        return { projects: [], settings: {} };
    }
}

// Save projects to config
function saveProjects(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        log.success(`Config saved successfully`);
        return true;
    } catch (err) {
        log.error(`Error writing config: ${err.message}`);
        throw err;
    }
}

// Port Scanner - Scan local ports for running services
async function scanPorts(startPort = 3000, endPort = 9999) {
    const openPorts = [];
    log.info(`Scanning ports ${startPort}-${endPort}...`);

    for (let port = startPort; port <= endPort; port++) {
        try {
            const inUse = await portUsed.check(port, '127.0.0.1');
            if (inUse) {
                openPorts.push(port);
                log.debug(`Port ${port} is in use`);
            }
        } catch (err) {
            // Port not in use, continue
        }
    }

    return openPorts;
}

// Get process info for a port
async function getProcessInfoForPort(port) {
    try {
        const processList = await find('port', port);
        if (processList && processList.length > 0) {
            const proc = processList[0];
            log.debug(`Found process on port ${port}: PID ${proc.pid}, Name: ${proc.name}`);
            
            return {
                pid: proc.pid,
                name: proc.name,
                cmd: proc.cmd,
                directory: '' // Users will provide the directory manually
            };
        }
    } catch (err) {
        log.debug(`Could not find process for port ${port}: ${err.message}`);
    }
    return null;
}

// Extract directory from command path
function extractDirectory(cmdPath) {
    if (!cmdPath) return '';
    try {
        // Remove quotes if present
        let cleanPath = cmdPath.replace(/^["']|["']$/g, '');
        // Get directory part
        let dir = path.dirname(cleanPath);
        // Resolve to absolute path
        dir = path.resolve(dir);
        return dir;
    } catch (err) {
        log.debug(`Error extracting directory: ${err.message}`);
        return '';
    }
}

// Store running processes
const runningProcesses = new Map(); // port -> { pid, process }

// Get local network IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and IPv6 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prefer non-loopback addresses
                if (!iface.address.startsWith('127.')) {
                    return iface.address;
                }
            }
        }
    }
    return '127.0.0.1'; // Fallback to localhost
}

// Kill process by port (Windows-compatible)
function killProcessByPort(port) {
    try {
        log.info(`Finding process on port ${port}...`);
        
        // Find PID using netstat
        const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        
        if (output) {
            const lines = output.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5) {
                    const pid = parseInt(parts[parts.length - 1]);
                    if (pid && pid > 0) {
                        log.info(`Killing PID ${pid} on port ${port}...`);
                        try {
                            execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
                            log.success(`Process killed successfully`);
                            return true;
                        } catch (err) {
                            log.warn(`Could not kill PID ${pid}: ${err.message}`);
                        }
                    }
                }
            }
        }
        
        // Also try to find and kill using find-process
        find('port', port)
            .then(list => {
                list.forEach(proc => {
                    try {
                        log.info(`Also killing process: ${proc.name} (PID ${proc.pid})`);
                        execSync(`taskkill /PID ${proc.pid} /F`, { stdio: 'pipe' });
                    } catch (err) {
                        log.warn(`Could not kill ${proc.name}: ${err.message}`);
                    }
                });
            })
            .catch(err => log.warn(`Error finding process: ${err.message}`));
        
        return true;
    } catch (err) {
        log.warn(`Could not find process on port ${port}: ${err.message}`);
        return false;
    }
}

// Initialize mDNS responder
function initializeMDNS(domain, port) {
    try {
        const mdn = mdns();
        const localIP = getLocalIP();

        log.info(`Using local network IP: ${localIP}`);

        // Respond to mDNS queries
        mdn.on('query', (query) => {
            // Load config to get all project domains
            const config = loadProjects();
            const allDomains = [config.settings.mdnsDomain, ...config.projects.map(p => p.domain)];

            // Respond to queries for any of our domains
            allDomains.forEach(d => {
                if (query.questions.some(q => q.name === `${d}.local`)) {
                    mdn.respond({
                        answers: [{
                            name: `${d}.local`,
                            type: 'A',
                            ttl: 300,
                            data: localIP  // Use actual network IP instead of 127.0.0.1
                        }]
                    });
                }
            });
        });

        // Actively announce domains every 30 seconds
        const announceInterval = setInterval(() => {
            try {
                const config = loadProjects();
                const allDomains = [config.settings.mdnsDomain, ...config.projects.map(p => p.domain)];
                
                allDomains.forEach(d => {
                    mdn.respond({
                        answers: [{
                            name: `${d}.local`,
                            type: 'A',
                            ttl: 300,
                            data: localIP
                        }]
                    });
                });
                
                log.debug(`Announced ${allDomains.length} domains to network`);
            } catch (err) {
                log.error(`Announcement error: ${err.message}`);
            }
        }, 30000);

        // Cleanup on exit
        process.on('exit', () => {
            clearInterval(announceInterval);
            mdn.destroy();
        });

        const config = loadProjects();
        log.success(`mDNS responder active for: ${config.settings.mdnsDomain}.local and all project domains`);
        return mdn;
    } catch (err) {
        log.warn(`mDNS initialization note: ${err.message}`);
        log.info(`You can still access the dashboard at http://localhost:${port}`);
        return null;
    }
}

// API Routes

// Get all projects
app.get('/api/projects', (req, res) => {
    const config = loadProjects();
    res.json(config.projects);
});

// Add new project
app.post('/api/projects', (req, res) => {
    const { name, port, domain, path: projectPath, executable } = req.body;

    if (!name || !port) {
        return res.status(400).json({ error: 'Name and port are required' });
    }

    const config = loadProjects();
    const project = {
        id: Date.now(),
        name,
        port,
        domain: domain || name.toLowerCase().replace(/\s+/g, '-'),
        path: projectPath || '',
        executable: executable || '',
        enabled: true,
        createdAt: new Date()
    };

    config.projects.push(project);
    saveProjects(config);

    res.json(project);
});

// Update project
app.put('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const config = loadProjects();
    const project = config.projects.find(p => p.id === parseInt(id));

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    Object.assign(project, updates);
    saveProjects(config);

    res.json(project);
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
    const { id } = req.params;

    const config = loadProjects();
    killProcessByPort(config.projects.find(p => p.id === parseInt(id))?.port);
    config.projects = config.projects.filter(p => p.id !== parseInt(id));
    saveProjects(config);

    res.json({ success: true });
});

// Scan for open ports
app.get('/api/scan-ports', async (req, res) => {
    const config = loadProjects();
    const { start = 3000, end = 9999 } = req.query;

    try {
        const openPorts = await scanPorts(parseInt(start), parseInt(end));

        // Get process info for each port
        const portsWithInfo = await Promise.all(
            openPorts.map(async (port) => {
                const processInfo = await getProcessInfoForPort(port);
                return {
                    port,
                    processInfo
                };
            })
        );

        res.json({ openPorts, portsWithInfo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get port status
app.get('/api/port-status/:port', async (req, res) => {
    const { port } = req.params;

    try {
        const inUse = await portUsed.check(parseInt(port), '127.0.0.1');
        res.json({ port: parseInt(port), isOpen: inUse });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Execute project helper function
function executeProject(project) {
    try {
        // Resolve project path
        let projectPath = project.path;
        if (!path.isAbsolute(projectPath)) {
            projectPath = path.resolve(__dirname, projectPath);
        }

        // Execute based on file type
        let command = project.executable;
        const ext = path.extname(command).toLowerCase();

        // Auto-detect file type and add appropriate interpreter
        if (ext === '.py') {
            command = `python3 "${command}"`;
        } else if (ext === '.js') {
            command = `node "${command}"`;
        } else if (ext === '.bat' || ext === '.cmd') {
            command = `cmd /c "${command}"`;
        } else if (ext === '.exe') {
            command = `"${command}"`;
        }

        const options = {
            cwd: projectPath,
            detached: false,
            shell: true,
            stdio: 'pipe'
        };

        log.info(`Executing: ${command}`);
        log.debug(`Working directory: ${options.cwd}`);

        const child = exec(command, options, (error, stdout, stderr) => {
            if (error) {
                log.error(`Execution error: ${error}`);
            }
            if (stdout) log.debug(`Output: ${stdout}`);
            if (stderr) log.warn(`Stderr: ${stderr}`);
        });

        // Store process reference
        runningProcesses.set(project.port, { pid: child.pid, process: child });

        // Detach so process continues
        if (child.unref) child.unref();

        return {
            success: true,
            command: command,
            cwd: projectPath,
            port: project.port,
            domain: project.domain
        };
    } catch (err) {
        log.error(`Execute error: ${err.message}`);
        throw err;
    }
}

// Run/Execute project
app.post('/api/execute/:id', (req, res) => {
    const { id } = req.params;

    const config = loadProjects();
    const project = config.projects.find(p => p.id === parseInt(id));

    if (!project) {
        log.warn(`Execute request for non-existent project: ${id}`);
        return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.executable) {
        log.warn(`Execute request for project with no executable: ${project.name}`);
        return res.status(400).json({ error: 'No executable defined for this project' });
    }

    try {
        log.info(`Executing project: ${project.name}`);
        const result = executeProject(project);
        res.json({
            success: true,
            message: `Executing: ${project.name}`,
            executable: project.executable,
            ...result
        });
    } catch (err) {
        log.error(`Execute error for ${project.name}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Restart/refresh a project (kill and restart)
app.post('/api/restart/:id', async (req, res) => {
    const { id } = req.params;

    const config = loadProjects();
    const project = config.projects.find(p => p.id === parseInt(id));

    if (!project) {
        log.warn(`Restart request for non-existent project: ${id}`);
        return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.executable) {
        log.warn(`Restart request for project with no executable: ${project.name}`);
        return res.status(400).json({ error: 'No executable defined for this project' });
    }

    log.info(`Restarting project: ${project.name}`);

    try {
        // Kill process by port (Windows-compatible)
        killProcessByPort(project.port);

        // Wait for port to free up
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify port is free
        let retries = 5;
        while (retries > 0) {
            try {
                const stillInUse = await portUsed.check(project.port, '127.0.0.1');
                if (!stillInUse) {
                    log.success(`Port ${project.port} is now free`);
                    break;
                }
                log.debug(`Port still in use, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                retries--;
            } catch (err) {
                break;
            }
        }

        // Restart the project
        const result = executeProject(project);

        log.success(`Project restarted: ${project.name}`);
        res.json({
            success: true,
            message: `Restarted project: ${project.name}`,
            domain: `http://${project.domain}.local`,
            ...result
        });
    } catch (err) {
        log.error(`Restart error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Stop/Kill a project
app.post('/api/stop/:id', async (req, res) => {
    const { id } = req.params;

    const config = loadProjects();
    const project = config.projects.find(p => p.id === parseInt(id));

    if (!project) {
        log.warn(`Stop request for non-existent project: ${id}`);
        return res.status(404).json({ error: 'Project not found' });
    }

    log.info(`Stopping project: ${project.name}`);

    try {
        // Kill process by port
        killProcessByPort(project.port);

        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 1000));

        log.success(`Project stopped: ${project.name}`);
        res.json({
            success: true,
            message: `Stopped project: ${project.name}`
        });
    } catch (err) {
        log.error(`Stop error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Get configuration
app.get('/api/config', (req, res) => {
    const config = loadProjects();
    res.json(config.settings);
});

// Update configuration
app.put('/api/config', (req, res) => {
    try {
        log.debug(`Updating config with: ${JSON.stringify(req.body)}`);
        const config = loadProjects();
        config.settings = { ...config.settings, ...req.body };
        saveProjects(config);
        log.success(`Config update successful`);
        res.json(config.settings);
    } catch (err) {
        log.error(`Config update error: ${err.message}`);
        res.status(500).json({ error: 'Failed to save config: ' + err.message });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = http.createServer(app);

// Handle WebSocket upgrades for proxying
server.on('upgrade', (req, res, head) => {
    const host = req.headers.host || '';
    const localIP = getLocalIP();
    const domain = host.split(':')[0];
    const config = loadProjects();

    if (domain !== 'localhost' && domain !== '127.0.0.1' && domain !== localIP && domain !== config.settings.mdnsDomain && domain !== `${config.settings.mdnsDomain}.local`) {
        try {
            const config = loadProjects();
            const project = config.projects.find(p => {
                // Check if domain matches, handle both with and without .local
                const projectDomain = p.domain;
                return domain === projectDomain || domain === `${projectDomain}.local`;
            });

            if (project) {
                console.log(`🔌 WebSocket upgrade ${domain}.local → ${localIP}:${project.port}`);
                proxy.ws(req, res, head, { target: `http://${localIP}:${project.port}` });
            }
        } catch (err) {
            console.error('Error in WebSocket upgrade:', err);
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    }
});

server.listen(PORT, () => {
    initializeConfig();
    const config = loadProjects();

    log.section('mDNS Project Dashboard');
    log.success(`Server running on http://localhost`);
    log.info(`Access from your local network at: http://${config.settings.mdnsDomain}.local`);
    log.info(`All Projects accessible via ${config.settings.mdnsDomain}.local`);

    // Initialize mDNS
    const mdnsAd = initializeMDNS(config.settings.mdnsDomain, PORT);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    log.warn('Shutting down server...');
    process.exit(0);
});
