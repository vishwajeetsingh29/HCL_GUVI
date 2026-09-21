import { WebSocketServer, WebSocket } from 'ws';
import mongoose from 'mongoose';
import { Poll } from '../models/Poll.js';

const POLL_UPDATES_CHANNEL = 'channel:poll_updates';

// Map of pollId -> Set of WebSockets
const pollRooms = new Map();

export function setupWebSocket(server, redisSubscriber) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade only for /ws/polls/:id
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/polls\/([a-fA-F0-9]{24})$/);

    if (!match) {
      // Not a valid poll websocket path
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const pollId = match[1];

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.pollId = pollId;
      ws.isAlive = true;
      wss.emit('connection', ws, request);
    });
  });

  // Connection handler
  wss.on('connection', async (ws) => {
    const pollId = ws.pollId;

    if (!pollRooms.has(pollId)) {
      pollRooms.set(pollId, new Set());
    }
    pollRooms.get(pollId).add(ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      const room = pollRooms.get(pollId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) {
          pollRooms.delete(pollId);
        }
      }
    });

    ws.on('error', (err) => {
      console.warn(`[WebSocket] Client error on poll ${pollId}:`, err.message);
    });

    // Send initial poll state immediately to the newly connected client
    try {
      if (mongoose.Types.ObjectId.isValid(pollId)) {
        const poll = await Poll.findById(pollId);
        if (poll && ws.readyState === WebSocket.OPEN) {
          const initMsg = {
            type: 'poll_update',
            poll_id: poll._id.toString(),
            question: poll.question,
            options: poll.options,
            total_votes: poll.total_votes,
            timestamp: new Date().toISOString()
          };
          ws.send(JSON.stringify(initMsg) + '\n');
        }
      }
    } catch (err) {
      console.warn(`[WebSocket] Error sending initial state for poll ${pollId}:`, err.message);
    }
  });

  // Heartbeat ping/pong interval
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Setup Redis Subscriber
  if (redisSubscriber) {
    redisSubscriber.subscribe(POLL_UPDATES_CHANNEL, (err) => {
      if (err) {
        console.warn(`[Redis Pub/Sub] Failed to subscribe to '${POLL_UPDATES_CHANNEL}':`, err.message);
      } else {
        console.log(`[Redis Pub/Sub] Subscribed to channel '${POLL_UPDATES_CHANNEL}'`);
      }
    });

    redisSubscriber.on('message', (channel, message) => {
      if (channel === POLL_UPDATES_CHANNEL) {
        try {
          const update = JSON.parse(message);
          if (update && update.poll_id) {
            broadcastPollUpdate(update.poll_id, update);
          }
        } catch (err) {
          console.error('[Redis Pub/Sub] Error parsing pubsub message:', err.message);
        }
      }
    });
  }

  return wss;
}

export function broadcastPollUpdate(pollId, payload) {
  const room = pollRooms.get(pollId);
  if (!room || room.size === 0) return;

  const data = JSON.stringify(payload) + '\n';
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
