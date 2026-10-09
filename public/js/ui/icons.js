/**
 * The single icon set for the whole UI: 24x24 viewBox, 1.75 stroke, round
 * caps, drawn with currentColor so icons inherit the text colour around them.
 *
 * Static markup uses <span data-icon="name"></span> placeholders that
 * hydrateIcons() fills in; rendered markup calls icon('name') directly.
 */

const PATHS = {
    // Brand mark: a host dot broadcasting to the network
    logo: '<circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none"/><path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',

    projects: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 14h4"/>',
    scan: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 18 6"/><path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',

    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7.5 5.5v13l11-6.5z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    restart: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M17.5 14v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 11.1A1.5 1.5 0 0 0 8.8 19.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M9.5 7V5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v2"/>',
    terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
    folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 3.5 19h17z"/><path d="M12 10v4M12 16.5v.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 15.5v.01"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19.5h6M12 15.5v4"/>',
};

/**
 * SVG markup for an icon.
 * @param {string} name   key of PATHS
 * @param {number} size   rendered width/height in px
 */
export function icon(name, size = 16) {
    const body = PATHS[name] || PATHS.info;
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Replace every <span data-icon="..."> under `root` with its SVG. */
export function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 16);
    });
}
