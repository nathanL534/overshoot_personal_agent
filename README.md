# Browser Agent

A local browser automation agent controlled from the terminal, using Claude (planner) + Playwright (executor) + Overshoot RealtimeVision (live perception via camera/video).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER AGENT                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Backend Server                            │    │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐     │    │
│  │  │   Playwright    │───►│   Screen Streamer           │     │    │
│  │  │ (headed browser)│    │ (screenshots → WS frames)   │     │    │
│  │  └─────────────────┘    └──────────────┬──────────────┘     │    │
│  │                                        │                     │    │
│  │  ┌─────────────────┐                   │ WebSocket           │    │
│  │  │  Claude Planner │                   │                     │    │
│  │  └─────────────────┘                   ▼                     │    │
│  └────────────────────────────────────────┬─────────────────────┘    │
│                                           │                          │
│  ┌────────────────────────────────────────┼─────────────────────┐    │
│  │              Vision Bridge (Frontend)  │                     │    │
│  │                                        ▼                     │    │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐     │    │
│  │  │  Canvas Display │◄───│   Screen Frame Receiver     │     │    │
│  │  └────────┬────────┘    └─────────────────────────────┘     │    │
│  │           │                                                  │    │
│  │           ▼                                                  │    │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐     │    │
│  │  │ Overshoot SDK   │───►│   Vision Snapshots → WS     │     │    │
│  │  │ RealtimeVision  │    └─────────────────────────────┘     │    │
│  │  └─────────────────┘                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Flow:** Playwright screenshots → WebSocket → Frontend canvas → Overshoot analysis → Vision snapshots → Backend

## Quick Start (Unified Workflow)

The recommended workflow connects the agent to your existing Chrome browser so that **Overshoot sees exactly what the agent controls**.

### Step 1: Start Chrome with Remote Debugging

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### Step 2: Navigate to Your Target Page

In the Chrome window that opened, navigate to whatever page you want the agent to work on.

### Step 3: Start the Backend & Frontend

```bash
cd overshoot_personal_agent
npm run install:all
npm run dev
```

### Step 4: Set Up Vision Bridge

1. Open http://localhost:5173 (Vision Bridge)
2. Enter your Overshoot API key
3. Select **"Pick Window/Tab"** mode
4. Click **"Click to Pick Window"**
5. **Select the Chrome window** from Step 1 in the picker

Now Overshoot is watching your Chrome browser.

### Step 5: Run the Agent (Connected Mode)

```bash
npm run agent -- --goal "Fill the form with test data" --connect "http://localhost:9222"
```

The agent connects to **the same Chrome** that Overshoot is watching. Vision and execution are now aligned!

## Ports & URLs

| Service | URL |
|---------|-----|
| Backend Server | http://localhost:3001 |
| Demo Form Page | http://localhost:3001/demo |
| WebSocket | ws://localhost:3001/ws |
| Vision Bridge | http://localhost:5173 |

## Screen Streaming (Default Mode)

The agent automatically streams Playwright browser screenshots to the Vision Bridge:

1. Open Vision Bridge at http://localhost:5173
2. Select **"Browser Screen (from Playwright)"** mode (default)
3. Enter your Overshoot API key
4. Click **"Start Vision"**
5. In another terminal, run: `npm run agent -- --goal "your goal"`
6. Watch the browser screenshots appear in Vision Bridge and get analyzed by Overshoot

**No OBS required!** Screenshots flow directly: Playwright → WebSocket → Frontend → Overshoot

## Perception Alignment

For the agent's vision (what Overshoot sees) to match its actions (what the agent controls), they must be looking at the **same browser window**.

### Connect Mode (Best Alignment)

The `--connect` flag ensures perfect alignment:

1. Start Chrome with remote debugging: `--remote-debugging-port=9222`
2. Navigate to your target page in that Chrome
3. In Vision Bridge, pick that Chrome window
4. Run agent with: `--connect "http://localhost:9222"`

Now Overshoot watches the exact same Chrome window the agent controls.

### Standalone Mode (Manual Alignment)

If using standalone mode (no `--connect`), you must pick the Playwright window:

1. Start the agent: `npm run agent -- --goal "your goal"`
2. A Playwright Chromium window opens (orange "BROWSER AGENT" banner)
3. In Vision Bridge, select **"Pick Window/Tab"** mode
4. Click **"Click to Pick Window"**
5. Select the Playwright Chromium window in the picker

### Camera Mode (Alternative)

Use OBS Virtual Camera to capture the browser window:

1. Open OBS Studio
2. Add a Window Capture source pointing to your browser
3. Start Virtual Camera in OBS
4. In Vision Bridge, select **"Live Camera"** mode
5. Choose "OBS Virtual Camera" when prompted

## OBS Virtual Camera Setup (Optional - For Physical Camera)

If you want to use a physical camera or capture something other than Playwright:

## CLI Usage

```bash
# RECOMMENDED: Connect to existing Chrome (aligns vision with execution)
npm run agent -- --goal "Fill the form" --connect "http://localhost:9222"

# Alternative: Launch new Playwright browser with URL
npm run agent -- --goal "Fill the form" --url "http://localhost:3001/demo"

# Alternative: Launch new Playwright browser, navigate manually
npm run agent -- --goal "Fill the form"

# Extended allowlist
npm run agent -- --goal "Search for something" --connect "http://localhost:9222" --allowlist "localhost,google.com"

# Limit steps
npm run agent -- --goal "Complete the task" --connect "http://localhost:9222" --maxSteps 20
```

### Connect Mode (Recommended)

Use `--connect` to connect the agent to your existing Chrome browser:

1. Start Chrome with `--remote-debugging-port=9222`
2. Navigate to your target page
3. In Vision Bridge, pick that Chrome window
4. Run: `npm run agent -- --goal "your goal" --connect "http://localhost:9222"`
5. Agent controls the same page Overshoot is watching

**This is the recommended mode** because vision (Overshoot) and execution (agent) are perfectly aligned.

### Standalone Mode (Alternative)

Without `--connect`, the agent launches its own Playwright browser:

- With `--url`: Navigates directly to that URL
- Without `--url`: Opens blank page, you navigate manually, press Enter

In standalone mode, you'd need to pick the Playwright window in Vision Bridge to align perception.

### CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--goal` | Yes | - | Task for the agent to accomplish |
| `--connect` | No | - | CDP endpoint to connect to existing Chrome |
| `--url` | No | - | Starting URL (only for standalone mode) |
| `--allowlist` | No | localhost,127.0.0.1 | Comma-separated allowed domains |
| `--maxSteps` | No | 40 | Maximum steps before stopping |

## Environment Variables

### Backend (backend/.env)

```env
# Claude API Key (optional - uses mock planner if not set)
CLAUDE_API_KEY=sk-ant-...

# Server port
BACKEND_PORT=3001

# Domain allowlist
DOMAIN_ALLOWLIST=localhost,127.0.0.1

# Max steps
MAX_STEPS=40

# Headless mode (true/false)
PLAYWRIGHT_HEADLESS=false
```

### Frontend (frontend/.env)

```env
# ⚠️ WARNING: This key is exposed in client-side code!
# Only use for hackathon/demo purposes!
VITE_OVERSHOOT_API_KEY=ovs_your_key_here

# Backend WebSocket URL
VITE_WS_URL=ws://localhost:3001/ws
```

## Overshoot SDK Examples

The Overshoot RealtimeVision SDK runs in the browser and captures video from camera or file:

### Camera Input (default - back camera)

```javascript
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'your-api-key',
  prompt: 'Read any visible text',
  source: { type: 'camera', cameraFacing: 'user' }
})
```

### Video File Input

```javascript
const visionFromFile = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'your-api-key',
  prompt: 'Describe what you see',
  source: { type: 'video', file: videoFile }
})
```

### Default Camera (environment/back camera)

```javascript
// If source is omitted, SDK uses back camera when available
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'your-api-key',
  prompt: 'Describe the scene'
})
```

## Safety Features

1. **Domain Allowlist**: Navigation outside allowed domains requires user approval
2. **Risky Action Approval**: Actions containing submit/send/delete/pay/etc require confirmation
3. **CAPTCHA Detection**: Agent pauses and prompts user to solve CAPTCHAs manually
4. **Stuck Detection**: After 3 steps with no DOM changes, prompts user to continue

## Run Logs

Logs are written to `backend/runs/<timestamp>/`:

```
runs/2024-01-15T10-30-45/
├── actions.jsonl         # Action history
├── domSnapshots/         # DOM state per step
│   ├── 1.json
│   └── 2.json
├── visionSnapshots/      # Vision results per step
│   ├── 1.json
│   └── 2.json
├── screenshots/          # Screenshots per step
│   ├── 1.png
│   └── 2.png
└── final.json           # Final summary
```

## Project Structure

```
browser-agent/
├── backend/                    # Node + Express + Playwright
│   ├── src/
│   │   ├── cli.ts             # CLI agent runner
│   │   ├── server.ts          # Express + WebSocket server
│   │   ├── services/
│   │   │   ├── domSnapshot.ts # DOM extraction
│   │   │   ├── changeDetector.ts # Change detection
│   │   │   ├── planner.ts     # Claude planning
│   │   │   ├── executor.ts    # Playwright execution
│   │   │   ├── logger.ts      # Run logging
│   │   │   └── visionStore.ts # Vision state
│   │   └── types/
│   │       └── index.ts       # TypeScript types
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # Vite + React
│   ├── src/
│   │   ├── App.tsx            # Vision Bridge UI
│   │   ├── App.css
│   │   ├── main.tsx
│   │   ├── hooks/
│   │   │   ├── useVision.ts   # Overshoot SDK hook
│   │   │   └── useWebSocket.ts # WebSocket hook
│   │   └── types/
│   │       └── index.ts
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── package.json               # Root scripts
├── .env.example
└── README.md
```

## Troubleshooting

### Vision not streaming

- Ensure Overshoot API key is set in frontend/.env
- Check browser console for errors
- Try refreshing the Vision Bridge page
- Verify OBS Virtual Camera is running (for live mode)

### Agent stuck

- The agent will prompt you after 3 steps with no progress
- Check if the page loaded correctly
- Verify the demo server is running

### WebSocket disconnected

- Ensure backend is running on port 3001
- Check for firewall blocking WebSocket connections

## Security Warning

⚠️ **HACKATHON DEMO ONLY**

**The Overshoot API key in the frontend is client-exposed.** This is intentional for hackathon/demo purposes only.

The key is set in `frontend/.env` as `VITE_OVERSHOOT_API_KEY` and is bundled into the client-side JavaScript. Anyone viewing the page source can extract it.

**DO NOT:**
- Use production API keys
- Deploy this to public servers
- Commit real API keys to version control
- Share the built frontend bundle publicly

## License

MIT
