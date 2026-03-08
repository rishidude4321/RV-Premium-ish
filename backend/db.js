/**
 * MongoDB connection and helpers for user profiles.
 */
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'movie_db';
const COLLECTION = 'profiles';

let client = null;
let db = null;

async function connect() {
  if (!MONGODB_URI) return null;
  if (db) return db;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    return db;
  } catch (e) {
    console.warn('MongoDB connect failed:', e.message);
    return null;
  }
}

async function getProfiles(sub) {
  const d = await connect();
  if (!d) return null;
  const doc = await d.collection(COLLECTION).findOne({ auth0_sub: sub });
  return doc ? doc.profiles : null;
}

async function saveProfiles(sub, profiles) {
  const d = await connect();
  if (!d) return false;
  await d.collection(COLLECTION).updateOne(
    { auth0_sub: sub },
    { $set: { auth0_sub: sub, profiles, updatedAt: new Date() } },
    { upsert: true }
  );
  return true;
}

module.exports = { connect, getProfiles, saveProfiles };
