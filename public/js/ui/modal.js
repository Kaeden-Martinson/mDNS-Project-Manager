/**
 * Modal open/close helpers.
 *
 * Modals close via their close buttons ([data-close-modal]), by clicking the
 * dark backdrop, or with Escape (only the top-most modal closes).
 */

export function openModal(modal) {
    modal.classList.add('active');
    const firstInput = modal.querySelector('input:not([type=file]), button.btn-primary');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

export function closeModal(modal) {
    modal.classList.remove('active');
}

/** Wire up the generic close behaviours for every .modal on the page. */
export function initModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        // Click on the backdrop itself (not the dialog content)
        modal.addEventListener('mousedown', e => {
            if (e.target === modal) closeModal(modal);
        });
        modal.querySelectorAll('[data-close-modal]').forEach(btn =>
            btn.addEventListener('click', () => closeModal(modal))
        );
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const open = [...document.querySelectorAll('.modal.active')];
        // Highest z-index wins, ties go to the one later in the DOM
        open.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0));
        const top = open.pop();
        if (top) closeModal(top);
    });
}
