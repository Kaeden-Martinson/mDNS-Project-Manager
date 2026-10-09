/**
 * Input validation / normalisation for projects and settings.
 *
 * Every function returns either a cleaned value or throws a ValidationError
 * whose message is safe to show to the user. Routes turn that into a 400.
 */

class ValidationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'ValidationError';
        this.status = status;
    }
}

// A single DNS label: lowercase letters, digits and inner hyphens, max 63 chars.
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Turn any text into a valid domain label ("My API!" -> "my-api"). */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63)
        .replace(/-+$/, '');
}

/** Validate a domain label. Accepts an optional trailing ".local" and strips it. */
function validateDomain(value, field = 'Domain') {
    const domain = String(value || '').trim().toLowerCase().replace(/\.local\.?$/, '');
    if (!DOMAIN_LABEL.test(domain)) {
        throw new ValidationError(
            `${field} must be 1-63 characters of a-z, 0-9 or "-" and cannot start or end with "-"`
        );
    }
    return domain;
}

/** Validate a TCP port number (accepts numeric strings). */
function validatePort(value, field = 'Port') {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ValidationError(`${field} must be a whole number between 1 and 65535`);
    }
    return port;
}

/** Validate a required, trimmed, length-limited string. */
function requireString(value, field, maxLength = 500) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new ValidationError(`${field} is required`);
    }
    if (value.length > maxLength) {
        throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }
    return value.trim();
}

/** Same as requireString but allows empty values. */
function optionalString(value, field, maxLength = 500) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
    if (value.length > maxLength) {
        throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }
    return value.trim();
}

/**
 * Validate the user-editable fields of a project.
 *
 * @param {object}  input    Raw request body
 * @param {boolean} partial  true for updates (only provided fields are checked)
 * @returns {object} Only the whitelisted, cleaned fields
 */
function validateProjectInput(input, { partial = false } = {}) {
    if (!input || typeof input !== 'object') throw new ValidationError('Invalid request body');

    const out = {};
    const has = key => Object.prototype.hasOwnProperty.call(input, key);

    if (!partial || has('name')) out.name = requireString(input.name, 'Name', 100);
    if (!partial || has('port')) out.port = validatePort(input.port);

    // Domain is optional on create: it falls back to a slug of the name.
    if (has('domain') && String(input.domain || '').trim()) {
        out.domain = validateDomain(input.domain);
    } else if (!partial) {
        out.domain = validateDomain(slugify(out.name));
    }

    if (!partial || has('path')) out.path = optionalString(input.path, 'Path', 1000);
    if (!partial || has('executable')) out.executable = optionalString(input.executable, 'Command', 1000);
    if (has('enabled')) out.enabled = Boolean(input.enabled);

    return out;
}

/** Validate a (partial) settings update. Unknown keys are ignored. */
function validateSettingsInput(input) {
    if (!input || typeof input !== 'object') throw new ValidationError('Invalid request body');

    const out = {};
    if (input.mdnsDomain !== undefined) out.mdnsDomain = validateDomain(input.mdnsDomain, 'Dashboard domain');
    if (input.scanRange !== undefined) {
        const start = validatePort(input.scanRange && input.scanRange.start, 'Scan start');
        const end = validatePort(input.scanRange && input.scanRange.end, 'Scan end');
        if (start > end) throw new ValidationError('Scan start must be less than or equal to scan end');
        out.scanRange = { start, end };
    }
    return out;
}

module.exports = {
    ValidationError,
    slugify,
    validateDomain,
    validatePort,
    validateProjectInput,
    validateSettingsInput,
};
