import { Page } from 'playwright';
import { WebSocket } from 'ws';

export class ScreenStreamer {
  private page: Page | null = null;
  private clients: Set<WebSocket> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private intervalMs = 3000; // Every 3 seconds

  setPage(page: Page) {
    this.page = page;
  }

  addClient(ws: WebSocket) {
    this.clients.add(ws);
    console.log(`[ScreenStreamer] Client added, total: ${this.clients.size}`);
  }

  removeClient(ws: WebSocket) {
    this.clients.delete(ws);
    console.log(`[ScreenStreamer] Client removed, total: ${this.clients.size}`);
  }

  start() {
    if (this.running) return;
    this.running = true;

    console.log(`[ScreenStreamer] Starting, interval: ${this.intervalMs}ms`);

    this.intervalId = setInterval(async () => {
      if (!this.page || this.clients.size === 0) return;

      try {
        // Capture screenshot as base64
        const buffer = await this.page.screenshot({
          type: 'jpeg',
          quality: 70,
          fullPage: false,
        });

        const base64 = buffer.toString('base64');
        const message = JSON.stringify({
          type: 'screen_frame',
          payload: {
            timestamp: Date.now(),
            frame: base64,
            mimeType: 'image/jpeg',
          },
        });

        // Broadcast to all clients
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      } catch (err) {
        // Page might be navigating, ignore
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log('[ScreenStreamer] Stopped');
  }

  isRunning() {
    return this.running;
  }
}

export const screenStreamer = new ScreenStreamer();
