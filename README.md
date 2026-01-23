# Screen Copilot - AI Screen Agent

A hackathon MVP that captures your screen, analyzes it with Overshoot AI, and uses Claude CLI to plan and execute actions toward your goal.

## How It Works

1. **Start the app** - Frontend captures your screen via browser's screen sharing
2. **Pick what to share** - Choose entire screen, a window, or a browser tab
3. **AI analyzes** - Overshoot processes frames every 3 seconds
4. **Run the agent** - Claude CLI plans actions based on what it sees
5. **You approve** - Review and approve actions before execution

## Prerequisites

1. **Node.js 18+**
2. **Claude CLI** - Ensure `claude` command is available in your PATH
3. **Overshoot API Key** - Get from [overshoot.xyz](https://overshoot.xyz)

## Installation

```bash
cd overshoot
npm run install:all

# Add your Overshoot API key
cp frontend/.env.example frontend/.env
# Edit frontend/.env: VITE_OVERSHOOT_API_KEY=ovs_your_key_here
```

## Running

```bash
# Terminal 1: Start both backend + frontend
npm run dev

# Terminal 2: Run the agent (after screen capture is running)
npm run agent -- --goal "Your goal here" --mode proposal
```

Or run separately:
```bash
npm run server   # Backend only
npm run frontend # Frontend only
```

## Usage Flow

1. Open http://localhost:5173
2. Read and accept the consent warning
3. Select "Screen Capture" (default)
4. Click "Start Screen Capture"
5. Browser will show a picker - select your screen/window/tab
6. Recording indicator appears showing capture is active
7. Run the agent in another terminal with your goal

## Modes

### Proposal Mode (`--mode proposal`)
- Agent analyzes screen and suggests actions
- No actions are executed
- Great for testing

### Execute Mode (`--mode execute`)
- Agent can execute approved actions
- Risky actions require explicit approval

## Input Sources

- **Screen Capture** (Recommended) - Share your entire screen, a window, or a tab
- **Camera** - Use a webcam (useful with OBS Virtual Camera)
- **Video File** - Analyze a pre-recorded video

## Safety Features

- Consent required before any capture
- Recording indicator always visible
- Approval gates for risky actions
- Audit logging of all actions

## Troubleshooting

### "Screen sharing not working"
- Make sure you're using HTTPS or localhost
- Check browser permissions for screen sharing
- Try a different browser (Chrome works best)

### "Claude CLI not found"
- Ensure Claude CLI is installed and in your PATH
- Try running `claude --version` to verify

### "No vision data received"
- Check that Overshoot API key is set in frontend/.env
- Check browser console for API errors

## License

MIT - Hackathon project
