/**
 * /api/projects - CRUD for projects plus start/stop/restart/status/logs.
 */
const express = require('express');
const store = require('../config/store');
const runner = require('../services/runner');
const mdns = require('../services/mdns');
const { isPortOpen } = require('../services/ports');
const { validateProjectInput } = require('../utils/validation');
const { asyncHandler } = require('./helpers');
const log = require('../utils/logger').child('API');

const router = express.Router();

/** Load the project named by :id or reply 404. */
router.param('id', (req, res, next, id) => {
    const project = store.getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    req.project = project;
    next();
});

// List all projects
router.get('/', (req, res) => {
    res.json(store.getProjects());
});

// Running state of every project, in one request (the UI polls this)
router.get('/status', asyncHandler(async (req, res) => {
    const statuses = await Promise.all(store.getProjects().map(async p => ({
        id: p.id,
        running: await isPortOpen(p.port),
        managed: runner.isManaged(p),
    })));
    res.json(statuses);
}));

// Create a project
router.post('/', (req, res) => {
    const project = store.addProject(validateProjectInput(req.body));
    log.success(`Added project "${project.name}" (${project.domain}.local -> :${project.port})`);
    mdns.refresh();
    res.status(201).json(project);
});

// Update a project (only whitelisted fields; id/createdAt can't be overwritten)
router.put('/:id', (req, res) => {
    const changes = validateProjectInput(req.body, { partial: true });
    const project = store.updateProject(req.project.id, changes);
    log.info(`Updated project "${project.name}": ${Object.keys(changes).join(', ')}`);
    if (changes.domain) mdns.refresh();
    res.json(project);
});

// Delete a project. Pass ?stop=true to also stop it if it is running.
router.delete('/:id', asyncHandler(async (req, res) => {
    const project = req.project;
    if (req.query.stop === 'true' && (await isPortOpen(project.port))) {
        await runner.stop(project);
    }
    store.deleteProject(project.id);
    log.info(`Deleted project "${project.name}"`);
    res.json({ success: true });
}));

// Start
router.post('/:id/start', asyncHandler(async (req, res) => {
    const result = await runner.start(req.project);
    res.json({ success: true, message: `Started ${req.project.name}`, ...result });
}));

// Stop
router.post('/:id/stop', asyncHandler(async (req, res) => {
    const freed = await runner.stop(req.project);
    if (!freed) {
        return res.status(500).json({ error: `Port ${req.project.port} is still in use. Try running the dashboard as administrator.` });
    }
    log.success(`Stopped "${req.project.name}"`);
    res.json({ success: true, message: `Stopped ${req.project.name}` });
}));

// Restart
router.post('/:id/restart', asyncHandler(async (req, res) => {
    const result = await runner.restart(req.project);
    log.success(`Restarted "${req.project.name}"`);
    res.json({ success: true, message: `Restarted ${req.project.name}`, ...result });
}));

// Tail of the project's output log
router.get('/:id/logs', (req, res) => {
    res.type('text/plain').send(runner.readLog(req.project));
});

module.exports = router;
