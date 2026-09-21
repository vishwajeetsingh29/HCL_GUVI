import Redis from 'ioredis';
import { config } from '../config/index.js';

function getRedisOptions() {
  if (config.redisUrl) {
    return config.redisUrl;
  }

  let host = '127.0.0.1';
  let port = 6379;

  if (config.redisAddr) {
    if (config.redisAddr.startsWith('redis://') || config.redisAddr.startsWith('rediss://')) {
      return config.redisAddr;
    }
    const parts = config.redisAddr.split(':');
    host = parts[0] || '127.0.0.1';
    if (parts[1]) {
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort)) {
        port = parsedPort;
      }
    }
  }

  const options = {
    host,
    port,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    }
  };

  if (config.redisPassword) {
    options.password = config.redisPassword;
  }

  return options;
}

export let redisPublisher = null;
export let redisSubscriber = null;

export async function initRedis() {
  const options = getRedisOptions();

  redisPublisher = typeof options === 'string' ? new Redis(options) : new Redis(options);
  redisSubscriber = typeof options === 'string' ? new Redis(options) : new Redis(options);

  redisPublisher.on('connect', () => {
    console.log('[Redis] Publisher connected successfully');
  });
  redisPublisher.on('error', (err) => {
    console.warn(`[Redis] Publisher warning: ${err.message}`);
  });

  redisSubscriber.on('connect', () => {
    console.log('[Redis] Subscriber connected successfully');
  });
  redisSubscriber.on('error', (err) => {
    console.warn(`[Redis] Subscriber warning: ${err.message}`);
  });

  try {
    await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);
  } catch (err) {
    console.warn(`[Redis] Initial connection deferred / error: ${err.message}`);
  }

  return { redisPublisher, redisSubscriber };
}

export function isRedisHealthy() {
  return redisPublisher && (redisPublisher.status === 'ready' || redisPublisher.status === 'connect');
}

export async function closeRedis() {
  try {
    if (redisPublisher) await redisPublisher.quit();
    if (redisSubscriber) await redisSubscriber.quit();
    console.log('[Redis] Connections closed');
  } catch (err) {
    console.warn('[Redis] Error during close:', err.message);
  }
}
