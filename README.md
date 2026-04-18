# mDNS Project Dashboard

A local web dashboard to manage, monitor, and launch all your projects running on different local ports. Access your projects via mDNS at `http://mdns.local` from any device on your network.

## Features

✨ **Key Features:**
- **mDNS Support** - Access your dashboard at `http://mdns.local` from any network device
- **Port Scanning** - Auto-detect open ports or manually register projects with one click
- **Project Management** - Add, edit, and delete projects with custom domains and inline editing
- **One-Click Launch** - Run, stop, and restart projects directly from the dashboard
- **Live Port Monitoring** - Real-time status updates every 10 seconds with running project count
- **Professional Logging** - Color-coded server logs with timestamps and prefixes
- **Remote Connection Detection** - Helpful banner when accessing from different devices on the network
- **Persistent Storage** - All projects stored in local JSON config
- **Professional UI** - Modern dark-mode dashboard with expandable cards, sticky navbar, and SVG icons
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices

## Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **Windows, macOS, or Linux**

### For mDNS to Work
- **Windows**: Install [Bonjour Print Services](https://support.apple.com/downloads/bonjour) or use mDNS alternatives
- **macOS**: Built-in support
- **Linux**: Install `avahi-daemon`

## Installation

1. **Clone or download** this project
2. **Navigate to the project folder:**
   ```bash
   cd mDNS
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

### Windows Admin Requirement
For port scanning and process management to work optimally, run the server with Administrator privileges:
- Right-click Command Prompt and select "Run as Administrator"
- Then run `npm start`

## Configuration

The app uses a `projects.json` file to store your projects. This file is created automatically on first run.

**projects.json structure:**
```json
{
  "projects": [
    {
      "id": 1234567890,
      "name": "My Web App",
      "port": 3000,
      "domain": "myapp",
      "path": "C:\\Projects\\MyApp",
      "executable": "npm start",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "settings": {
    "mdnsDomain": "mdns",
    "scanRange": {
      "start": 3000,
      "end": 9999
    }
  }
}
```

## Usage

### Start the Server

```bash
npm start
```

You should see professional colored logs:
```
12:34:56 [SERVER] [+] mDNS responder active
12:34:56 [SERVER] [+] Config saved successfully
12:34:56 [SERVER] Server running on http://localhost
```

**Access your dashboard:**
- Local machine: `http://localhost` or `http://mdns.local`
- Other devices on network: `http://10.0.0.181` or `http://mdns.local`

### Adding a Project

**Method 1: Manual Entry**
1. Click the **"New Domain"** button in the top navbar
2. Fill in:
   - **Project Name** (required) - Display name for your project
   - **Domain** (auto-fills from project name) - Custom subdomain for .local access
   - **Port** (required) - The local port your project runs on
   - **Directory** (required) - Full path to your project folder
   - **Command** (required) - How to run the project (e.g., `npm start`, `python app.py`)
3. Click **"Save Project"**

**Method 2: Folder Picker (Recommended)**
1. Click **"New Domain"** button
2. Click the folder picker to browse to your project directory
3. The system will:
   - Auto-detect your project name from the folder
   - Scan for common server files (server.js, app.py, etc.)
   - Suggest appropriate commands (npm start, python3 app.py, etc.)
4. Adjust any fields if needed and save

### Managing Projects

**Run a Project:**
1. Find your project card on the dashboard
2. Click the **"Start"** button (green)
3. The status will update to show "Running" when the process starts

**Stop a Project:**
- Click the **"Stop"** button (red) on a running project

**Restart a Project:**
- Click the **"Restart"** button (cyan) to cleanly stop and restart it

**View/Edit Project Details:**
- Click anywhere on the project card to expand it
- Edit any field inline (Name, Domain, Port, Path, Command)
- Changes save automatically when you deselect the field

**Access Your Project:**
- Click the **"Open"** button to open in browser
- Or visit `http://[domain].local` directly (e.g., `http://myapp.local`)
- Copy the link with the **"Copy"** button

**Supported command formats:**
- `npm start` - Node.js projects
- `yarn start` - Yarn projects
- `python app.py` - Python projects
- `python3 app.py` - Python 3 projects
- `./start.bat` - Batch files
- `cmd /c start.bat` - Alternative batch execution
- `C:\Full\Path\To\executable.exe` - Direct executable paths
- PowerShell commands like `powershell -ExecutionPolicy Bypass -File script.ps1`

### Scanning for Ports

1. Click the **"Scan"** button in the top navbar
2. Adjust the port range if needed (default: 3000-9999)
3. Click **"Start Scanning"**
4. Results will show with:
   - Port number and process name
   - Indication if already registered ("Already Added")
   - Click **"+ Add"** to quickly register new ports as projects

## API Endpoints

The dashboard provides the following REST API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | Get all projects |
| POST | `/api/projects` | Add new project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/execute/:id` | Run/execute a project |
| GET | `/api/port-status/:port` | Check if port is open |
| GET | `/api/scan-ports?start=3000&end=9999` | Scan for open ports |
| GET | `/api/config` | Get settings |
| PUT | `/api/config` | Update settings |

### Example: Add a Project via API

```bash
curl -X POST http://localhost/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "React App",
    "port": 3000,
    "domain": "react-app",
    "path": "C:\\dev\\react-app",
    "executable": "npm start"
  }'
```

### Example: Execute a Project

```bash
curl -X POST http://localhost/api/execute/PROJECT_ID
```

## Advanced Usage

### Change Server Port

Edit `server.js` to change the default HTTP port:
```javascript
const PORT = 8080; // Default is 80 (HTTP)
```

Then access at `http://localhost:8080` or `http://mdns.local:8080`

### Access from Different Machines

If you can't access via `.local` domain:
- Find your local network IP (e.g., 192.168.1.5 or 10.0.0.181)
- Access dashboard: `http://10.0.0.181`
- Access project: `http://10.0.0.181:3000` (replace 3000 with actual project port)
- A helpful banner will appear telling you to use the main machine

### Manual Configuration

Edit `projects.json` directly to manage projects:

```json
{
  "projects": [
    {
      "id": 1234567890,
      "name": "My App",
      "port": 3000,
      "domain": "myapp",
      "path": "C:\\Projects\\MyApp",
      "executable": "npm start",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "settings": {
    "mdnsDomain": "mdns",
    "scanRange": { "start": 3000, "end": 9999 }
  }
}
```

### Command Examples

**Node.js Projects**
```
Command: npm start
Path: C:\Projects\MyApp
```

**Python Projects**
```
Command: python3 app.py
Path: /home/user/myapp
```

**Batch Files**
```
Command: cmd /c C:\Scripts\deploy.bat
Path: C:\Scripts
```

**PowerShell Scripts**
```
Command: powershell -ExecutionPolicy Bypass -File C:\Scripts\startup.ps1
Path: C:\Scripts
```

**Direct Executables**
```
Command: C:\Program Files\MyApp\app.exe
Path: C:\Program Files\MyApp
```

## Troubleshooting

### mDNS not working on your device?

1. **Windows**: Install [Bonjour Print Services](https://support.apple.com/downloads/bonjour) or use direct IP
2. **macOS**: Should work out of the box
3. **Linux**: Install avahi-daemon: `sudo apt-get install avahi-daemon`
4. **Mobile devices**: Some Android devices have mDNS limitations - use direct IP instead
5. **Fallback**: Use direct IP address (e.g., `http://10.0.0.181`) instead of `.local` domain

### Projects won't start?

- Verify the project path exists and is correct
- Ensure the port is not already in use by another application
- Check that you have permissions to execute the file
- For batch files: use `cmd /c C:\path\to\file.bat`
- For PowerShell: use `powershell -ExecutionPolicy Bypass -File C:\path\script.ps1`
- Review the server logs for error messages (color-coded with [SERVER] prefix)

### Port scanning not finding open ports?

- Increase the port range in the scan dialog
- Ensure projects are actually running on those ports
- Run the server with Administrator privileges on Windows
- Check firewall settings

### CORS or remote access issues?

- The dashboard automatically detects remote connections
- You'll see a helpful banner if accessing from a different device
- CORS is enabled by default for all network access
- API base URL is dynamic and works with any hostname/IP

## Project Structure

```
mDNS/
├── server.js              # Express server & API routes with professional logging
├── package.json           # Dependencies & npm scripts
├── projects.json          # Projects configuration (auto-created)
├── utils/
│   └── logger.js          # Professional logger class with color coding
├── public/
│   ├── index.html         # Main dashboard page with navbar
│   ├── app.js             # Frontend logic (800+ lines)
│   └── styles.css         # Professional dark-mode styling
└── README.md              # This file
```

## Dependencies

- **express** (^4.18.2) - Web server framework
- **multicast-dns** (^7.2.5) - mDNS responder for .local domains
- **tcp-port-used** (^1.0.1) - Port availability checking
- **find-process** - Process discovery by port
- **http-proxy** - Domain-based reverse proxying
- **cors** (^2.8.5) - Cross-Origin Resource Sharing
- **body-parser** (^1.20.2) - JSON request parsing

## Performance Tips

- Limit port range when scanning (smaller = faster)
- Close unused projects to reduce port monitoring
- mDNS discovery works best on the same local network

## Security Notes

⚠️ **Important:**
- This dashboard should **only** be used on trusted local networks
- It can execute arbitrary commands on your machine
- Do not expose this to the internet without authentication
- Anyone with access can execute any command

## Common Use Cases

### Development Environment
Manage all your local dev servers from one dashboard:
- **Frontend**: React, Vue, Angular (ports 3000-3010)
- **Backend**: Node.js, Python (ports 5000-5010)
- **APIs**: Express, Flask (ports 8000-8010)
- **Databases**: MongoDB (27017), PostgreSQL (5432)

### Local Testing
Monitor and launch multiple test environments

### IoT/Embedded Projects
Manage services running on Raspberry Pi or similar devices on your network

## Future Enhancements

- Dashboard with charts and metrics
- Authentication and user management
- Project documentation and notes
- Auto-restart on failure
- Docker container support
- Advanced network discovery
- System tray integration
- Project grouping and organization
- Activity logging and debugging output

## Contributing

Feel free to fork, modify, and improve this project!

## License

MIT

## Support

For issues or questions, check the troubleshooting section above or review the API endpoints documentation.

---

**Happy coding!**

Access your dashboard at: **http://mdns.local**

Manage all your local projects in one place!
