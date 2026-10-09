/**
 * Small DOM / string helpers shared by the frontend modules.
 */

/** Shorthand for document.getElementById. */
export const $ = id => document.getElementById(id);

/**
 * Escape text for safe insertion into HTML (content *and* attribute values).
 * The old UI interpolated project names, paths and process names straight into
 * innerHTML, so a name like <img onerror=...> executed script.
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

/** Turn text into a valid domain label: "My API!" -> "my-api". Mirrors the server. */
export function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63)
        .replace(/-+$/, '');
}

/** Public URL of a project, keeping the dashboard's port if it isn't 80. */
export function projectUrl(domain) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://${domain}.local${port}`;
}

/**
 * Copy text to the clipboard.
 * navigator.clipboard only exists on secure origins (https or localhost), so
 * on http://mdns.local the old code threw. Fall back to a hidden textarea.
 */
export async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    if (!ok) throw new Error('Copy command was rejected');
}
