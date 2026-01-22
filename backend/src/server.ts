import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import { visionStore } from './services/visionStore.js';
import { screenStreamer } from './services/screenStreamer.js';
import type { WSMessageFromClient, LogEvent } from './types/index.js';

config();

const PORT = parseInt(process.env.BACKEND_PORT || '3001');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
const clients = new Set<WebSocket>();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS for frontend
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
    lastVisionUpdate: visionStore.getTimeSinceLastUpdate(),
    screenStreaming: screenStreamer.isRunning(),
  });
});

// Demo page for testing
app.get('/demo', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo Form - Browser Agent Test</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { max-width: 500px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-weight: 500; color: #555; }
    input[type="text"], input[type="email"], select {
      width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px;
      font-size: 14px; transition: border-color 0.2s;
    }
    input:focus, select:focus { outline: none; border-color: #007bff; }
    .checkbox-group { display: flex; align-items: center; gap: 8px; }
    .checkbox-group input { width: auto; }
    button {
      background: #007bff; color: white; border: none; padding: 12px 24px;
      border-radius: 6px; font-size: 16px; cursor: pointer; width: 100%;
      transition: background 0.2s;
    }
    button:hover { background: #0056b3; }
    .status-box {
      margin-top: 20px; padding: 16px; background: #e8f4f8; border-radius: 6px;
      border: 1px solid #b8daff;
    }
    .status-box h3 { margin: 0 0 8px 0; color: #004085; }
    .status-item { font-size: 13px; color: #555; margin: 4px 0; }
    .status-item.filled { color: #28a745; }
    .status-item.empty { color: #dc3545; }
  </style>
</head>
<body>
  <h1>Demo Registration Form</h1>

  <form id="demoForm" onsubmit="return false;">
    <div class="form-group">
      <label for="name">Full Name</label>
      <input type="text" id="name" name="name" placeholder="Enter your name" oninput="updateStatus()">
    </div>

    <div class="form-group">
      <label for="email">Email Address</label>
      <input type="email" id="email" name="email" placeholder="Enter your email" oninput="updateStatus()">
    </div>

    <div class="form-group">
      <label for="role">Select Role</label>
      <select id="role" name="role" onchange="updateStatus()">
        <option value="">Choose a role...</option>
        <option value="developer">Developer</option>
        <option value="designer">Designer</option>
        <option value="manager">Manager</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div class="form-group">
      <div class="checkbox-group">
        <input type="checkbox" id="newsletter" name="newsletter" onchange="updateStatus()">
        <label for="newsletter" style="margin: 0;">Subscribe to newsletter</label>
      </div>
    </div>

    <button type="submit" id="submitBtn">Submit Registration</button>
  </form>

  <div class="status-box">
    <h3>Form Status</h3>
    <div id="statusContent">
      <div class="status-item empty">Name: Not filled</div>
      <div class="status-item empty">Email: Not filled</div>
      <div class="status-item empty">Role: Not selected</div>
      <div class="status-item empty">Newsletter: Not checked</div>
    </div>
    <div id="readyStatus" style="margin-top: 12px; font-weight: bold; color: #dc3545;">
      Not ready to submit
    </div>
  </div>

  <script>
    function updateStatus() {
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const role = document.getElementById('role').value;
      const newsletter = document.getElementById('newsletter').checked;

      const items = [
        { label: 'Name', value: name, filled: !!name },
        { label: 'Email', value: email, filled: !!email },
        { label: 'Role', value: role || 'Not selected', filled: !!role },
        { label: 'Newsletter', value: newsletter ? 'Subscribed' : 'Not checked', filled: newsletter },
      ];

      const html = items.map(item =>
        '<div class="status-item ' + (item.filled ? 'filled' : 'empty') + '">' +
        item.label + ': ' + (item.filled ? item.value : 'Not filled') + '</div>'
      ).join('');

      document.getElementById('statusContent').innerHTML = html;

      const allFilled = name && email && role;
      const readyEl = document.getElementById('readyStatus');
      if (allFilled) {
        readyEl.textContent = 'Ready to submit!';
        readyEl.style.color = '#28a745';
      } else {
        readyEl.textContent = 'Not ready to submit';
        readyEl.style.color = '#dc3545';
      }
    }
  </script>
</body>
</html>`);
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  clients.add(ws);

  // Add to screen streamer for receiving frames
  screenStreamer.addClient(ws);

  ws.on('message', (data) => {
    try {
      const message: WSMessageFromClient = JSON.parse(data.toString());

      if (message.type === 'vision_snapshot') {
        visionStore.update(message.payload);
        console.log('[Vision] Snapshot received:', message.payload.summaryText.slice(0, 80));
      } else if (message.type === 'user_response') {
        console.log('[WS] User response:', message.payload);
      }
    } catch (error) {
      console.error('[WS] Invalid message:', error);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    clients.delete(ws);
    screenStreamer.removeClient(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error);
    clients.delete(ws);
    screenStreamer.removeClient(ws);
  });
});

// Broadcast log to all clients
export function broadcastLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  const event: LogEvent = {
    type: 'log',
    payload: { level, message, data },
  };
  const payload = JSON.stringify(event);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Demo page: http://localhost:${PORT}/demo`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
});

export { app, server, wss };
