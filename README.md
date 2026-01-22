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

## Quick Start

```bash
# 1. Install dependencies
npm run install:all

# 2. Set up environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Edit .env files with your API keys

# 4. Start development servers (backend + frontend)
npm run dev

# 5. In another terminal, run the agent
npm run agent -- --goal "Fill the form with dummy data and stop before submit."
```

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

For the agent's vision (what it sees) to match its actions (what it controls), you must ensure the Vision Bridge is capturing the same browser the agent is controlling.

### Pick Window Mode (Recommended)

1. Start the agent: `npm run agent -- --goal "your goal"`
2. Open Vision Bridge at http://localhost:5173
3. Select **"Pick Window/Tab"** mode
4. Click **"Click to Pick Window"**
5. In the picker dialog, select the **Playwright Chromium window** (the one with the orange "BROWSER AGENT" banner)
6. Now the Vision Bridge sees the same page the agent is controlling

### Camera Mode (Alternative)

Use OBS Virtual Camera to capture the Playwright window:

1. Open OBS Studio
2. Add a Window Capture source pointing to the Playwright Chromium window
3. Start Virtual Camera in OBS
4. In Vision Bridge, select **"Live Camera"** mode
5. Choose "OBS Virtual Camera" when prompted

## OBS Virtual Camera Setup (Optional - For Physical Camera)

If you want to use a physical camera or capture something other than Playwright:

## CLI Usage

```bash
# Run with manual navigation (no URL - navigate in the browser yourself)
npm run agent -- --goal "Fill the form with dummy data and stop before submit."

# Run with a specific URL
npm run agent -- --goal "Fill the form" --url "http://localhost:3001/demo"

# Extended allowlist
npm run agent -- --goal "Search for something" --allowlist "localhost,127.0.0.1,google.com"

# Limit steps
npm run agent -- --goal "Complete the task" --maxSteps 20
```

### Manual Navigation Mode

When you run the agent **without** `--url`, it opens a blank Playwright browser and waits for you to navigate:

1. Run: `npm run agent -- --goal "your goal"`
2. A Playwright Chromium browser opens (blank page)
3. Manually navigate to the page you want the agent to operate on
4. Press Enter in the terminal when ready
5. If the domain is not in the allowlist, you'll be prompted to approve it
6. The agent begins executing your goal on the current page

This is useful when you want to:
- Log into a site manually before the agent takes over
- Navigate to a specific page state
- Test the agent on any arbitrary website

### CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--goal` | Yes | - | Task for the agent to accomplish |
| `--url` | No | (manual navigation) | Starting URL. If omitted, user navigates manually |
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
