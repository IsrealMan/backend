import { WebSocketServer } from 'ws';
import { verifyAccessToken } from './tokens.js';

const orgRooms = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    try {
      const decoded = verifyAccessToken(token);
      ws.userId = decoded.userId;
      ws.orgId = decoded.orgId?.toString();
      ws.role = decoded.role;

      // Join org room
      if (ws.orgId) {
        if (!orgRooms.has(ws.orgId)) {
          orgRooms.set(ws.orgId, new Set());
        }
        orgRooms.get(ws.orgId).add(ws);
      }

      ws.send(JSON.stringify({ type: 'connected', userId: ws.userId }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          handleMessage(ws, msg);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        if (ws.orgId && orgRooms.has(ws.orgId)) {
          orgRooms.get(ws.orgId).delete(ws);
          if (orgRooms.get(ws.orgId).size === 0) {
            orgRooms.delete(ws.orgId);
          }
        }
      });

    } catch (err) {
      ws.close(4002, 'Invalid token');
    }
  });

  return wss;
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'broadcast':
      broadcastToOrg(ws.orgId, { type: 'broadcast', from: ws.userId, data: msg.data });
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      ws.send(JSON.stringify({ type: 'echo', data: msg }));
  }
}

export function broadcastToOrg(orgId, message) {
  if (orgRooms.has(orgId)) {
    const data = JSON.stringify(message);
    orgRooms.get(orgId).forEach(client => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }
}
