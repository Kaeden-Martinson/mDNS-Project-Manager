/**
 * Small colour-coded console logger.
 *
 * Every line looks like:  12:34:56 [PREFIX] [LEVEL] message
 *
 * The minimum level printed is controlled by the LOG_LEVEL environment
 * variable (debug | info | warn | error). Defaults to "info" so the console
 * isn't flooded with per-port debug noise during scans.
 */

// ANSI colour codes for terminal output
const colors = {
    reset: '\x1b[0m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

// Numeric weight of each level; a message prints if its weight >= the threshold
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

class Logger {
    /**
     * @param {string} prefix Tag shown in brackets on every line, e.g. "SERVER"
     */
    constructor(prefix = 'SERVER') {
        this.prefix = prefix;
    }

    /** Create a logger with a different prefix (e.g. one per subsystem). */
    child(prefix) {
        return new Logger(prefix);
    }

    /** HH:MM:SS in 24h format. */
    getTimestamp() {
        return new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    }

    /** Build the final coloured line. */
    formatMessage(level, message, levelColor) {
        const timeString = `${colors.gray}${this.getTimestamp()}${colors.reset}`;
        const prefixString = `${colors.blue}[${this.prefix}]${colors.reset}`;
        const levelString = `${levelColor}[${level}]${colors.reset}`;
        return `${timeString} ${prefixString} ${levelString} ${message}`;
    }

    debug(message) {
        if (threshold <= LEVELS.debug) console.log(this.formatMessage('DEBUG', message, colors.gray));
    }

    info(message) {
        if (threshold <= LEVELS.info) console.log(this.formatMessage('INFO', message, colors.cyan));
    }

    /** Same weight as info, but rendered green with a check mark. */
    success(message) {
        if (threshold <= LEVELS.info) console.log(this.formatMessage('✓', message, colors.green));
    }

    warn(message) {
        if (threshold <= LEVELS.warn) console.warn(this.formatMessage('!', message, colors.yellow));
    }

    error(message) {
        if (threshold <= LEVELS.error) console.error(this.formatMessage('✗', message, colors.red));
    }

    /** Large banner used once at startup. */
    section(title) {
        const width = 50;
        const line = `${colors.blue}${'='.repeat(width)}${colors.reset}`;
        const padded = title.padStart(Math.floor((title.length + width) / 2)).padEnd(width);
        console.log(`\n${line}\n${colors.blue}${padded}${colors.reset}\n${line}\n`);
    }
}

// Shared root logger; modules call `logger.child('NAME')` for their own prefix.
module.exports = new Logger('SERVER');
module.exports.Logger = Logger;
