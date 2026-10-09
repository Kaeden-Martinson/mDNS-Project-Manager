# mDNS Project Manager

A local dashboard to register, launch and monitor the dev projects running on your machine, and reach each one at its own `http://<name>.local` address from any device on your network.

- **mDNS names**: The dashboard is at `http://mdns.local` and every project gets `http://<domain>.local`.
- **Reverse proxy**: Requests for `<domain>.local` are forwarded to the project's port, WebSockets included, so hot-reload keeps working.
- **Start / Stop / Restart**: Runs each project's command in its folder and kills the whole process tree when you stop it.
- **Output**: Each project's output is saved to `logs/<domain>.log` and can be viewed from the dashboard.
- **Port scanner**: Finds servers that are already running and lets you add them with one click.
- **Live status**: Running/stopped status refreshes every 5 seconds.

## Requirements

- **Node.js 18+**
- mDNS support on the devices that will resolve `.local` names:
  - **Windows 10/11**: Built in. On older versions, install Bonjour.
  - **macOS / iOS**: Built in.
  - **Linux**: `avahi-daemon` with `nss-mdns`.
  - **Android**: Support varies by version and browser. Use the IP address if `.local` names don't resolve.

## Quick start

```bash
npm install
```

```bash
npm start
```

The server listens on port 80 by default, so `http://mdns.local` works without a port number. On Windows you may need an **Administrator** terminal. On macOS or Linux, either use `sudo` or pick a higher port:

```bash
PORT=8080 npm start
```

Then open `http://localhost` on the machine itself, or `http://mdns.local` (or the printed IP address) from another device.

### Environment variables

| Variable      | Default          | Purpose                                   |
|---------------|------------------|-------------------------------------------|
| `PORT`        | `80`             | HTTP port for the dashboard and the proxy |
| `HOST`        | `0.0.0.0`        | Address to bind to                        |
| `CONFIG_FILE` | `./projects.json`| Where projects and settings are stored    |
| `LOG_LEVEL`   | `info`           | `debug`, `info`, `warn` or `error`        |

## Using it

### Add a project

1. Click **Add project**.
2. Optionally pick the project folder. The dashboard looks at the top-level files (such as `package.json`, `server.js`, `app.py` or `manage.py`) to suggest a name and a start command. Browsers don't reveal a folder's full path, so you still have to paste the path into **Directory**.
3. Fill in the **Port** the project listens on. The domain follows the project name until you edit it yourself.
4. Click **Save Project**.

You can also open **Port scan**, scan a range, and click **Add** next to a server that is already running.

### Run it

Click a project row to expand it. The row itself has a quick Start/Stop button and an Open link. The expanded panel lets you:

- **Start, Stop or Restart** the project.
- Toggle **Output** to see its log.
- Edit any field inline. Changes save when you leave the field or press Enter.

The command runs through the system shell inside the project directory, with `PORT` set to the project's port. If the command is just a script path, the right interpreter is added for you:

| Command           | Runs as                                         |
|-------------------|-------------------------------------------------|
| `app.py`          | `python app.py` (Windows) / `python3 app.py`    |
| `server.js`       | `node server.js`                                |
| `start.ps1`       | `powershell -ExecutionPolicy Bypass -File ...`  |
| `start.sh`        | `sh start.sh`                                   |
| `npm run dev` etc.| unchanged                                       |

Projects keep running if the dashboard is stopped.

## How it works

```
 phone / laptop                      this machine
 ──────────────                      ─────────────────────────────────────
 "who is myapp.local?"  ──mDNS──▶   src/services/mdns.js answers with the LAN IP
 GET http://myapp.local ──HTTP──▶   src/services/proxy.js  ──▶ 127.0.0.1:<project port>
 GET http://mdns.local  ──HTTP──▶   dashboard (public/) + JSON API (src/routes/)
```

## Project structure

```
server.js                  Entry point: HTTP server, WebSocket upgrades, shutdown
src/
  app.js                   Express app: proxy -> host check -> API -> static files
  config/
    constants.js           Ports, paths, defaults (env overrides)
    store.js               projects.json persistence (cached, atomic writes, validation)
  middleware/
    security.js            Host allow-list (DNS rebinding) + same-origin check (CSRF)
  routes/
    projects.js            /api/projects CRUD + start/stop/restart/status/logs
    system.js              /api/config, /api/port-status, /api/scan-ports
    helpers.js             asyncHandler + JSON error handler
  services/
    mdns.js                mDNS responder / announcer
    proxy.js               Reverse proxy for <domain>.local (HTTP + WebSocket)
    runner.js              Launches projects, tracks children, log files
    processes.js           Find/kill the processes listening on a port (Win/macOS/Linux)
    ports.js               Fast parallel TCP port probing / scanning
  utils/
    logger.js              Coloured console logger with LOG_LEVEL
    network.js             Local IP / hostname helpers
    pages.js               Small HTML pages (project offline, unknown host)
    validation.js          Input validation for projects and settings
public/
  index.html
  css/styles.css
  js/
    main.js                Frontend entry point, view switching, status polling
    api.js                 fetch wrapper for the API
    state.js               Shared client state
    projectList.js         Projects table, expandable rows, inline editing, controls
    projectForm.js         Add project dialog + command detection
    scanner.js             Port scan and Settings views
    utils.js               escapeHtml, slugify, clipboard...
    ui/icons.js            The SVG icon set (no emoji anywhere in the UI)
    ui/toast.js, ui/modal.js
```

`projects.json` and `logs/` hold local data and are git-ignored. `projects.json` is created on first run.

## API

All endpoints are under `/api` and use JSON.

| Method | Path                          | Description                                 |
|--------|-------------------------------|---------------------------------------------|
| GET    | `/projects`                   | List projects                               |
| POST   | `/projects`                   | Create `{name, port, domain?, path, executable}` |
| PUT    | `/projects/:id`               | Update any of the fields above              |
| DELETE | `/projects/:id[?stop=true]`   | Delete, optionally stopping it first        |
| GET    | `/projects/status`            | `[{id, running, managed}]` for all projects |
| POST   | `/projects/:id/start`         | Start                                       |
| POST   | `/projects/:id/stop`          | Stop (kills the process tree on its port)   |
| POST   | `/projects/:id/restart`       | Restart                                     |
| GET    | `/projects/:id/logs`          | Last 64 KB of output (text)                 |
| GET    | `/config` / PUT `/config`     | Settings `{mdnsDomain, scanRange:{start,end}}` |
| GET    | `/port-status/:port`          | `{port, isOpen}`                            |
| GET    | `/scan-ports?start=&end=`     | Open ports plus process name/PID            |

Example:

```bash
curl -X POST http://localhost/api/projects -H "Content-Type: application/json" -d '{"name":"My App","port":3000,"path":"C:/code/my-app","executable":"npm run dev"}'
```

## Security notes

The dashboard can run commands on your machine, so keep these in mind:

- **Browser requests are restricted.** API calls that change something are rejected if they come from another website (CSRF), and the API only answers on known hostnames, which blocks DNS-rebinding attacks.
- **Your LAN is still trusted.** Anyone on your network who can open the dashboard can start, stop and edit projects. Only run it on networks you trust, or bind it to localhost with `HOST=127.0.0.1`.
- **Stopping a project kills whatever is listening on its port**, even if the dashboard didn't start it.

## Troubleshooting

- **`.local` names don't resolve.** Make sure UDP port 5353 is allowed through your firewall. Another mDNS service (such as Bonjour or iTunes) can also hold the port exclusively. You can always fall back to the IP address.
- **"Permission denied for port 80".** Run as Administrator or root, or set `PORT=8080`.
- **A project won't start.** Open **Output** in its row. The usual causes are a wrong directory, a command that isn't on `PATH`, or the app ignoring the port you entered.
- **A project shows "Stopped" but is running.** Check that it listens on the port you registered. Servers bound to `127.0.0.1`, `::1` or `0.0.0.0` are all detected.
- **Stop doesn't work on Windows.** Processes started by another user or as admin can only be killed if the dashboard is running as Administrator.

## License

MIT
