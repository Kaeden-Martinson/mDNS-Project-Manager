/**
 * Shared client-side state. Kept in one place so the different UI modules
 * don't need to pass arrays around or read state back out of the DOM (the old
 * status bar counted "running" projects by looking at disabled buttons).
 */
export const state = {
    /** Projects as returned by GET /api/projects. */
    projects: [],

    /** id -> { running: boolean, managed: boolean } from GET /api/projects/status. */
    statuses: new Map(),

    /** id -> label ("Starting", "Stopping"...) while an action is in flight. */
    busy: new Map(),

    /** ids of cards that are currently expanded; survives re-renders. */
    expanded: new Set(),

    /** ids whose log panel is open. */
    logsOpen: new Set(),

    /** Settings from GET /api/config. */
    settings: null,

    /** Time of the last successful status refresh. */
    lastUpdated: null,
};

/** Look up a project by id (ids may be numbers from old configs or UUID strings). */
export function findProject(id) {
    return state.projects.find(p => String(p.id) === String(id)) || null;
}
