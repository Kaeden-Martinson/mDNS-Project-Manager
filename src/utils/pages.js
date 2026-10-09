/**
 * Tiny server-rendered HTML pages for situations where the dashboard SPA
 * isn't appropriate (project offline, unknown host, proxy failure).
 */
const store = require('../config/store');

/** Escape text for safe inclusion in HTML. */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

/** URL of the dashboard, e.g. "http://mdns.local". */
function dashboardUrl(req) {
    const host = String((req && req.headers.host) || '');
    const port = host.includes(':') && !host.endsWith(']') ? `:${host.split(':').pop()}` : '';
    return `http://${store.getSettings().mdnsDomain}.local${port}`;
}

/** Generic page with a title, message and optional link back to the dashboard. */
function message(title, body, link = null) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         background: #0c0d11; color: #e7e9ee; font: 14px/1.55 Inter, system-ui, sans-serif; }
  main { max-width: 440px; width: 100%; padding: 28px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; }
  h1 { font-size: 18px; font-weight: 700; letter-spacing: -.02em; margin: 0 0 6px; }
  p { color: #959aa7; margin: 0; }
  a { display: inline-block; margin-top: 20px; padding: 7px 14px; border-radius: 999px;
      background: #6b93ff; color: #0b0f1c; font-weight: 500; text-decoration: none; }
  a:hover { background: #82a4ff; }
</style>
</head>
<body><main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${link ? `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>` : ''}
</main></body>
</html>`;
}

/** Shown when someone visits <project>.local while the project isn't running. */
function projectOffline(project, req) {
    return message(
        `${project.name} is offline`,
        `Nothing is listening on port ${project.port}. Start it from the dashboard and refresh this page.`,
        { href: dashboardUrl(req), label: 'Open dashboard' }
    );
}

/** Shown for hostnames that are neither the dashboard nor a known project. */
function unknownHost(hostname, req) {
    return message(
        'Unknown domain',
        `"${hostname}" is not registered with the mDNS Project Manager.`,
        { href: dashboardUrl(req), label: 'Open dashboard' }
    );
}

module.exports = { escapeHtml, message, projectOffline, unknownHost };
