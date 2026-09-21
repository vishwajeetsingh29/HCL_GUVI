import mongoose from 'mongoose';
import { config } from '../config/index.js';

export async function connectMongo() {
  const uri = config.mongoUri.includes('?') || config.mongoUri.includes(config.mongoDbName)
    ? config.mongoUri
    : `${config.mongoUri.replace(/\/+$/, '')}/${config.mongoDbName}`;

  try {
    await mongoose.connect(uri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Successfully connected to database: ${config.mongoDbName}`);
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    throw err;
  }
}

export function isMongoHealthy() {
  // readyState 1 means connected
  return mongoose.connection.readyState === 1;
}

export async function closeMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('[MongoDB] Connection closed');
  }
}
