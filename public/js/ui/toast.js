/**
 * Toast notifications (bottom-right).
 */
import { $ } from '../utils.js';
import { icon } from './icons.js';

const TYPE_ICON = { success: 'check', error: 'error', warning: 'alert', info: 'info' };

/** Animate a toast out, then remove it. Safe to call twice. */
function removeToast(toast) {
    if (toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 180);
}

/**
 * Show a toast.
 * @param {string} message  Plain text (newlines are kept; HTML is NOT interpreted)
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} duration ms before auto-close; 0 keeps it open
 */
export function showToast(message, type = 'info', duration = 4000) {
    const kind = TYPE_ICON[type] ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        ${icon(TYPE_ICON[kind])}
        <div class="toast-content"></div>
        <button class="icon-btn sm" aria-label="Dismiss">${icon('close', 14)}</button>
    `;
    // textContent, not innerHTML: messages can contain server/user data
    toast.querySelector('.toast-content').textContent = message;
    toast.querySelector('button').addEventListener('click', () => removeToast(toast));

    $('toastContainer').appendChild(toast);
    if (duration > 0) setTimeout(() => removeToast(toast), duration);
    return toast;
}
