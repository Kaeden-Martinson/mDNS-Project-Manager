/**
 * /api - dashboard-wide endpoints: settings, port status and port scanning.
 */
const express = require('express');
const store = require('../config/store');
const mdns = require('../services/mdns');
const { isPortOpen, scanPorts } = require('../services/ports');
const { getProcessInfoForPort } = require('../services/processes');
const { validatePort, validateSettingsInput, ValidationError } = require('../utils/validation');
const { getLocalIP } = require('../utils/network');
const { asyncHandler } = require('./helpers');
const log = require('../utils/logger').child('API');

const router = express.Router();

// Largest range a single scan may cover, to keep scans reasonably quick
const MAX_SCAN_SPAN = 20_000;

// Current settings plus a little read-only info for the UI
router.get('/config', (req, res) => {
    res.json({ ...store.getSettings(), localIP: getLocalIP() });
});

// Update settings (validated; unknown keys ignored)
router.put('/config', (req, res) => {
    const settings = store.updateSettings(validateSettingsInput(req.body));
    log.info('Settings updated');
    if (req.body.mdnsDomain) mdns.refresh();
    res.json(settings);
});

// Is anything listening on a single port?
router.get('/port-status/:port', asyncHandler(async (req, res) => {
    const port = validatePort(req.params.port);
    res.json({ port, isOpen: await isPortOpen(port) });
}));

// Scan a range of ports and identify the processes behind them
router.get('/scan-ports', asyncHandler(async (req, res) => {
    const defaults = store.getSettings().scanRange;
    const start = validatePort(req.query.start || defaults.start, 'Scan start');
    const end = validatePort(req.query.end || defaults.end, 'Scan end');
    if (start > end) throw new ValidationError('Scan start must be less than or equal to scan end');
    if (end - start > MAX_SCAN_SPAN) throw new ValidationError(`Please scan at most ${MAX_SCAN_SPAN} ports at a time`);

    log.info(`Scanning ports ${start}-${end}...`);
    const started = Date.now();
    const openPorts = await scanPorts(start, end);
    const portsWithInfo = await Promise.all(openPorts.map(async port => ({
        port,
        processInfo: await getProcessInfoForPort(port),
    })));
    log.info(`Scan found ${openPorts.length} open port(s) in ${Date.now() - started} ms`);

    res.json({ openPorts, portsWithInfo });
}));

module.exports = router;
