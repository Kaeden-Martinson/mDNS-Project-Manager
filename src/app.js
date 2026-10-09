/**
 * Builds the Express application.
 *
 * Request flow:
 *   1. Project domains (myapp.local)  -> reverse-proxied to the project's port
 *   2. Unknown hosts                  -> 404 page (blocks DNS rebinding)
 *   3. Dashboard hosts                -> static frontend + JSON API
 *
 * Order matters: the proxy must run before any body parser, otherwise the
 * request body is consumed and never reaches the proxied project.
 */
const express = require('express');
const { PUBLIC_DIR } = require('./config/constants');
const { proxyMiddleware } = require('./services/proxy');
const security = require('./middleware/security');
const projectRoutes = require('./routes/projects');
const systemRoutes = require('./routes/system');
const { apiErrorHandler } = require('./routes/helpers');

function createApp() {
    const app = express();
    app.disable('x-powered-by');

    // 1. Project domains are proxied straight through
    app.use(proxyMiddleware);

    // 2. Everything below is the dashboard itself
    app.use(security.requireDashboardHost);
    app.use(security.markRemoteClients);

    // 3. JSON API
    const api = express.Router();
    api.use(security.requireSameOrigin);
    api.use(express.json({ limit: '100kb' }));
    api.use('/projects', projectRoutes);
    api.use('/', systemRoutes);
    api.use((req, res) => res.status(404).json({ error: 'Not found' }));
    api.use(apiErrorHandler);
    app.use('/api', api);

    // 4. Frontend (index.html is served for "/" automatically)
    app.use(express.static(PUBLIC_DIR));

    return app;
}

module.exports = { createApp };
