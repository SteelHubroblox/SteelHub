const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// Serve static files from the same directory (public)
app.use(express.static(path.join(__dirname)));

const wss = new WebSocket.Server({ server, path: '/ws' });

let waiting = null; // single waiting socket
let rooms = new Map(); // roomId -> {a,b}
let nextRoomId = 1;

function safeSend(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'queue') {
      if (waiting && waiting.readyState === WebSocket.OPEN) {
        const roomId = nextRoomId++;
        const a = waiting; const b = ws; waiting = null;
        rooms.set(roomId, { a, b });
        a.roomId = b.roomId = roomId;
        a.peer = b; b.peer = a;
        // Assign roles: a -> p1, b -> p2
        safeSend(a, { type: 'match', role: 0 });
        safeSend(b, { type: 'match', role: 1 });
      } else {
        waiting = ws;
      }
    } else if (msg.type === 'state' || msg.type === 'bullet') {
      if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
        safeSend(ws.peer, msg);
      }
    }
  });

  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    const peer = ws.peer;
    if (peer && peer.readyState === WebSocket.OPEN) { try { peer.close(); } catch {} }
    ws.peer = null;
  });
});

// Heartbeat
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 15000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
});