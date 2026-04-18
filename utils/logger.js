// ANSI Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

/**
 * Professional Logger Class
 * Provides color-coded, prefixed logging for different log levels
 */
class Logger {
    constructor(prefix = 'SERVER') {
        this.prefix = prefix;
    }

    /**
     * Format timestamp
     */
    getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
        });
    }

    /**
     * Format log message with prefix and timestamp
     */
    formatMessage(level, message, levelColor) {
        const timestamp = this.getTimestamp();
        const prefixString = `${colors.blue}[${this.prefix}]${colors.reset}`;
        const levelString = `${levelColor}[${level}]${colors.reset}`;
        const timeString = `${colors.gray}${timestamp}${colors.reset}`;
        
        return `${timeString} ${prefixString} ${levelString} ${message}`;
    }

    /**
     * Info level - general information
     */
    info(message) {
        console.log(this.formatMessage('INFO', message, colors.cyan));
    }

    /**
     * Success level - successful operations
     */
    success(message) {
        console.log(this.formatMessage('✓', message, colors.green));
    }

    /**
     * Warning level - warnings
     */
    warn(message) {
        console.warn(this.formatMessage('!', message, colors.yellow));
    }

    /**
     * Error level - errors
     */
    error(message) {
        console.error(this.formatMessage('✗', message, colors.red));
    }

    /**
     * Debug level - debug information
     */
    debug(message) {
        console.log(this.formatMessage('DEBUG', message, colors.gray));
    }

    /**
     * Request logging
     */
    request(method, url, from = 'unknown') {
        this.info(`${colors.cyan}${method}${colors.reset} ${url} from ${from}`);
    }

    /**
     * API Route logging
     */
    api(method, endpoint, status) {
        const statusColor = status >= 200 && status < 300 ? colors.green : status >= 400 ? colors.red : colors.yellow;
        this.info(`${colors.cyan}${method}${colors.reset} ${endpoint} ${statusColor}${status}${colors.reset}`);
    }

    /**
     * Section header for organizing logs
     */
    section(title) {
        console.log(`\n${colors.blue}${'='.repeat(50)}${colors.reset}`);
        console.log(`${colors.blue}${title.padStart((title.length + 50) / 2).padEnd(50)}${colors.reset}`);
        console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);
    }
}

module.exports = Logger;
