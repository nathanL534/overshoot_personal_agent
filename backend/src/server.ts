import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import type { VisionSnapshot, WSMessageFromClient, StatusEvent, AgentState } from './types/index.js';

config();

const PORT = parseInt(process.env.BACKEND_PORT || '3001');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Latest vision snapshot storage
let latestSnapshot: VisionSnapshot | null = null;
let lastSnapshotAt: number | null = null;

// Track connected clients
const clients = new Set<WebSocket>();

// Current agent state for broadcasting
let currentAgentState: AgentState | null = null;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    hasVision: !!latestSnapshot,
    lastSnapshotAt,
    agentRunning: currentAgentState?.running || false,
  });
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  clients.add(ws);

  // Send current status
  sendStatus(ws);

  ws.on('message', (data) => {
    try {
      const message: WSMessageFromClient = JSON.parse(data.toString());

      if (message.type === 'vision_snapshot') {
        latestSnapshot = message.payload;
        lastSnapshotAt = Date.now();
        console.log('[Vision] Snapshot received:', message.payload.summaryText.slice(0, 80) + '...');
      }
    } catch (error) {
      console.error('[WS] Invalid message:', error);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error);
    clients.delete(ws);
  });
});

function sendStatus(ws: WebSocket) {
  const status: StatusEvent = {
    type: 'status',
    payload: {
      connected: true,
      lastSnapshotAt: lastSnapshotAt || undefined,
      agentState: currentAgentState?.running ? 'running' : 'idle',
      step: currentAgentState?.currentStep,
    },
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(status));
  }
}

function broadcastStatus() {
  clients.forEach((client) => {
    sendStatus(client);
  });
}

// Export functions for CLI
export function getLatestSnapshot(): VisionSnapshot | null {
  return latestSnapshot;
}

export function setAgentState(state: AgentState) {
  currentAgentState = state;
  broadcastStatus();
}

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
});

export { app, server, wss };
