const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
app.use(bodyParser.json());

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Map of ws -> filter state
const subs = new Map();

function createFilterState() {
  return { types: new Set(), submitters: new Set(), startTime: null, endTime: null };
}

function matchesFilter(filter, evt) {
  if (filter.types.size > 0 && !filter.types.has(evt.event_type)) return false;
  if (filter.submitters.size > 0 && !filter.submitters.has(evt.submitter)) return false;
  if (filter.startTime !== null && evt.timestamp < filter.startTime) return false;
  if (filter.endTime !== null && evt.timestamp > filter.endTime) return false;
  return true;
}

wss.on('connection', (ws) => {
  subs.set(ws, createFilterState());
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      const filter = subs.get(ws);

      if (data.action === 'subscribe') {
        if (data.type) filter.types.add(data.type);
        if (data.submitter) filter.submitters.add(data.submitter);
        if (data.startTime != null) filter.startTime = data.startTime;
        if (data.endTime != null) filter.endTime = data.endTime;
        if (data.filters) {
          if (data.filters.types) data.filters.types.forEach((t) => filter.types.add(t));
          if (data.filters.submitters) data.filters.submitters.forEach((s) => filter.submitters.add(s));
          if (data.filters.startTime != null) filter.startTime = data.filters.startTime;
          if (data.filters.endTime != null) filter.endTime = data.filters.endTime;
        }
      } else if (data.action === 'subscribe_all') {
        subs.set(ws, createFilterState());
      } else if (data.action === 'unsubscribe') {
        if (data.type) filter.types.delete(data.type);
        if (data.submitter) filter.submitters.delete(data.submitter);
        if (data.clearStartTime) filter.startTime = null;
        if (data.clearEndTime) filter.endTime = null;
        if (data.clearTimeRange) { filter.startTime = null; filter.endTime = null; }
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => subs.delete(ws));
});

function broadcastEvent(evt) {
  for (const [ws, filter] of subs.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (matchesFilter(filter, evt)) {
      ws.send(JSON.stringify({ type: 'event_logged', event: evt }));
    }
  }
}

// Simple HTTP emit endpoint for testing: POST /emit { event }
app.post('/emit', (req, res) => {
  const evt = req.body.event;
  if (!evt) return res.status(400).send('no event');
  broadcastEvent(evt);
  res.send('ok');
});

// Health check endpoints (#268)
const wsStartTime = Date.now();

app.get('/healthz', (req, res) => res.json({
  status: 'ok',
  service: 'websocket',
  uptime: Math.floor((Date.now() - wsStartTime) / 1000),
  connections: subs.size,
  timestamp: new Date().toISOString(),
}));

app.get('/readyz', (req, res) => {
  const checks = {
    websocket: { status: wss.readyState === 0 ? 'ok' : 'degraded' },
  };
  const allHealthy = Object.values(checks).every((c) => c.status === 'ok');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    service: 'websocket',
    checks,
    connections: subs.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Periodic ping for connection health
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('ws server listening', PORT));
