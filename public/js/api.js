/**
 * Thin wrapper around fetch() for the dashboard API.
 *
 * Uses a relative "/api" base so it works on any host *and port* the page was
 * loaded from (the old code hard-coded http://<hostname>/api, which broke as
 * soon as the server ran on anything other than port 80).
 */
const API_BASE = '/api';

/**
 * Perform a request and return the parsed JSON (or text) body.
 * Throws an Error with the server's message on non-2xx responses.
 */
async function request(path, { method = 'GET', body } = {}) {
    const options = { method, headers: {} };
    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(API_BASE + path, options);
    const isJson = (response.headers.get('Content-Type') || '').includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        const message = (isJson && data && data.error) || `Request failed (${response.status})`;
        throw new Error(message);
    }
    return { data, response };
}

const get = async path => (await request(path)).data;
const send = async (method, path, body) => (await request(path, { method, body })).data;

export const api = {
    /** Raw request (used when the caller needs response headers). */
    request,

    listProjects: () => get('/projects'),
    projectStatuses: () => get('/projects/status'),
    createProject: project => send('POST', '/projects', project),
    updateProject: (id, changes) => send('PUT', `/projects/${encodeURIComponent(id)}`, changes),
    deleteProject: (id, { stop = false } = {}) =>
        send('DELETE', `/projects/${encodeURIComponent(id)}${stop ? '?stop=true' : ''}`),

    startProject: id => send('POST', `/projects/${encodeURIComponent(id)}/start`),
    stopProject: id => send('POST', `/projects/${encodeURIComponent(id)}/stop`),
    restartProject: id => send('POST', `/projects/${encodeURIComponent(id)}/restart`),
    projectLogs: id => get(`/projects/${encodeURIComponent(id)}/logs`),

    getConfig: () => get('/config'),
    updateConfig: changes => send('PUT', '/config', changes),
    scanPorts: (start, end) => get(`/scan-ports?start=${start}&end=${end}`),
};
