/**
 * Shared helpers for route handlers.
 */
const log = require('../utils/logger').child('API');

/**
 * Wrap an async route so rejected promises reach the error handler.
 * (Express 4 doesn't do this on its own; unhandled rejections would hang the request.)
 */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Final JSON error handler for the API. ValidationErrors carry their own
 * status code and a user-friendly message; anything else is a 500.
 */
// eslint-disable-next-line no-unused-vars
function apiErrorHandler(err, req, res, next) {
    // express.json() reports malformed bodies with type 'entity.parse.failed'
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    const status = err.status || 500;
    if (status >= 500) log.error(`${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = { asyncHandler, apiErrorHandler };
