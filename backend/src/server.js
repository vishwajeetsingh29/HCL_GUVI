import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { connectMongo, isMongoHealthy, closeMongo } from './database/mongo.js';
import { initRedis, isRedisHealthy, closeRedis } from './database/redis.js';
import { setupWebSocket } from './websocket/hub.js';
import apiRouter from './routes/api.js';

async function bootstrap() {
  console.log(`Starting Polling Backend Service (Node.js) on port ${config.port}...`);

  const app = express();

  // Middleware
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true
    })
  );
  app.use(express.json());

  // Welcome / service info endpoint
  app.get('/', (req, res) => {
    res.status(200).json({
      service: 'PulsePoll Live Polling Backend API',
      status: 'online',
      health: '/health',
      websocket: '/ws/polls/:id',
      timestamp: new Date().toISOString()
    });
  });

  // Health check endpoint
  const healthHandler = (req, res) => {
    const mongoStatus = isMongoHealthy();
    const redisStatus = isRedisHealthy();

    const isHealthy = mongoStatus; // Redis can be soft degraded without halting core reads
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoStatus ? 'healthy' : 'unhealthy',
        redis: redisStatus ? 'healthy' : 'disconnected'
      }
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Mount API router
  app.use('/api', apiRouter);

  // Global 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled application error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);

  // 1. Connect MongoDB
  try {
    await connectMongo();
  } catch (err) {
    console.error('Failed to initialize MongoDB. Exiting...');
    process.exit(1);
  }

  // 2. Connect Redis
  let redisSubscriber = null;
  try {
    const redisInstances = await initRedis();
    redisSubscriber = redisInstances.redisSubscriber;
  } catch (err) {
    console.warn('Redis connection deferred, running in standalone mode:', err.message);
  }

  // 3. Initialize WebSocket Hub
  setupWebSocket(server, redisSubscriber);
  console.log('WebSocket Hub initialized on /ws/polls/:id');

  // 4. Start HTTP Server
  server.listen(config.port, () => {
    console.log(`Server listening on http://0.0.0.0:${config.port}`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Shutting down server gracefully...`);

    server.close(async () => {
      console.log('HTTP and WebSocket server closed');
      await closeRedis();
      await closeMongo();
      console.log('Graceful shutdown completed');
      process.exit(0);
    });

    // Force exit after timeout if shutdown hangs
    setTimeout(() => {
      console.error('Forced shutdown after 10s timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
