const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Check if running with external database (e.g. Railway PostgreSQL)
const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;

// Local JSON fallback path
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'db.json');

// Default initial state for local fallback
const defaultState = {
  rooms: [],
  notebookPages: {},
  userProfiles: {}
};

// Ensure local data dir exists
if (!DATABASE_URL) {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('[DB] Failed to create data directory:', e.message);
    }
  }
}

function loadLocalDB() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[DB] Could not load local db.json, creating new:', err.message);
  }
  return { ...defaultState };
}

function saveLocalDB(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Failed to write local db.json:', err.message);
  }
}

/**
 * Initialize Database (Postgres on Railway or Local JSON storage)
 */
async function initDB() {
  if (DATABASE_URL) {
    console.log('[DB] Connecting to PostgreSQL via DATABASE_URL on Railway...');
    try {
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('rlwy.net')
          ? { rejectUnauthorized: false }
          : false
      });

      // Test connection
      const client = await pool.connect();
      console.log('[DB] PostgreSQL connected successfully!');

      // Create Tables if not exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS rooms (
          id VARCHAR(100) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          language VARCHAR(100) NOT NULL,
          flag VARCHAR(20),
          level VARCHAR(100),
          level_code VARCHAR(50),
          topic VARCHAR(150),
          topic_key VARCHAR(100),
          capacity INT DEFAULT 6,
          is_private BOOLEAN DEFAULT FALSE,
          password VARCHAR(100) DEFAULT '',
          created_at BIGINT,
          is_scheduled BOOLEAN DEFAULT FALSE,
          scheduled_for BIGINT DEFAULT NULL,
          host_json JSONB,
          participants_json JSONB DEFAULT '[]'::jsonb,
          messages_json JSONB DEFAULT '[]'::jsonb,
          vocab_json JSONB DEFAULT '[]'::jsonb,
          rsvp_users_json JSONB DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notebook_pages (
          id SERIAL PRIMARY KEY,
          user_name VARCHAR(150) NOT NULL,
          page_num INT NOT NULL,
          title VARCHAR(255),
          date_str VARCHAR(100),
          cue_tags_json JSONB DEFAULT '[]'::jsonb,
          notes_json JSONB DEFAULT '[]'::jsonb,
          summary_text TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_name, page_num)
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
          name VARCHAR(150) PRIMARY KEY,
          avatar VARCHAR(50),
          photo_url TEXT,
          native_lang VARCHAR(100),
          target_lang VARCHAR(100),
          fluency_level VARCHAR(50),
          bio TEXT,
          streak INT DEFAULT 1,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      client.release();
      console.log('[DB] PostgreSQL schema initialized (rooms, notebook_pages, user_profiles).');
    } catch (err) {
      console.error('[DB] PostgreSQL initialization failed, falling back to local storage:', err.message);
      pool = null;
    }
  } else {
    console.log('[DB] No DATABASE_URL found. Using persistent local storage at:', LOCAL_DB_PATH);
  }
}

/**
 * Load all rooms from database
 */
async function loadRooms() {
  if (pool) {
    try {
      const res = await pool.query('SELECT * FROM rooms ORDER BY is_scheduled ASC, created_at DESC');
      return res.rows.map(row => ({
        id: row.id,
        title: row.title,
        language: row.language,
        flag: row.flag,
        level: row.level,
        levelCode: row.level_code,
        topic: row.topic,
        topicKey: row.topic_key,
        capacity: row.capacity,
        isPrivate: row.is_private,
        password: row.password,
        createdAt: Number(row.created_at),
        isScheduled: Boolean(row.is_scheduled),
        scheduledFor: row.scheduled_for ? Number(row.scheduled_for) : null,
        host: row.host_json || { name: 'Host', avatar: '🦊' },
        participants: row.participants_json || [],
        messages: row.messages_json || [],
        vocabList: row.vocab_json || [],
        rsvpUsers: row.rsvp_users_json || []
      }));
    } catch (err) {
      console.error('[DB] Error loading rooms from Postgres:', err.message);
      return [];
    }
  } else {
    const db = loadLocalDB();
    return db.rooms || [];
  }
}

/**
 * Save or update a room
 */
async function saveRoom(room) {
  if (pool) {
    try {
      const query = `
        INSERT INTO rooms (
          id, title, language, flag, level, level_code, topic, topic_key,
          capacity, is_private, password, created_at, is_scheduled, scheduled_for,
          host_json, participants_json, messages_json, vocab_json, rsvp_users_json, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          language = EXCLUDED.language,
          flag = EXCLUDED.flag,
          level = EXCLUDED.level,
          level_code = EXCLUDED.level_code,
          topic = EXCLUDED.topic,
          topic_key = EXCLUDED.topic_key,
          capacity = EXCLUDED.capacity,
          is_private = EXCLUDED.is_private,
          password = EXCLUDED.password,
          is_scheduled = EXCLUDED.is_scheduled,
          scheduled_for = EXCLUDED.scheduled_for,
          host_json = EXCLUDED.host_json,
          participants_json = EXCLUDED.participants_json,
          messages_json = EXCLUDED.messages_json,
          vocab_json = EXCLUDED.vocab_json,
          rsvp_users_json = EXCLUDED.rsvp_users_json,
          updated_at = NOW();
      `;

      await pool.query(query, [
        room.id,
        room.title,
        room.language,
        room.flag,
        room.level,
        room.levelCode,
        room.topic,
        room.topicKey,
        room.capacity,
        room.isPrivate,
        room.password || '',
        room.createdAt,
        Boolean(room.isScheduled),
        room.scheduledFor || null,
        JSON.stringify(room.host || {}),
        JSON.stringify(room.participants || []),
        JSON.stringify(room.messages || []),
        JSON.stringify(room.vocabList || []),
        JSON.stringify(room.rsvpUsers || [])
      ]);
    } catch (err) {
      console.error('[DB] Error saving room to Postgres:', err.message);
    }
  } else {
    const db = loadLocalDB();
    if (!db.rooms) db.rooms = [];
    const idx = db.rooms.findIndex(r => r.id === room.id);
    if (idx >= 0) {
      db.rooms[idx] = room;
    } else {
      db.rooms.push(room);
    }
    saveLocalDB(db);
  }
}

/**
 * Delete a room
 */
async function deleteRoom(roomId) {
  if (pool) {
    try {
      await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    } catch (err) {
      console.error('[DB] Error deleting room from Postgres:', err.message);
    }
  } else {
    const db = loadLocalDB();
    if (db.rooms) {
      db.rooms = db.rooms.filter(r => r.id !== roomId);
      saveLocalDB(db);
    }
  }
}

/**
 * Add an RSVP for a scheduled room
 */
async function toggleRSVP(roomId, user) {
  if (pool) {
    try {
      const res = await pool.query('SELECT rsvp_users_json FROM rooms WHERE id = $1', [roomId]);
      if (res.rows.length > 0) {
        let rsvps = res.rows[0].rsvp_users_json || [];
        const existingIdx = rsvps.findIndex(u => u.name === user.name || (user.id && u.id === user.id));
        let userRSVPed = false;
        if (existingIdx >= 0) {
          rsvps.splice(existingIdx, 1);
          userRSVPed = false;
        } else {
          rsvps.push({
            name: user.name,
            avatar: user.avatar,
            time: Date.now()
          });
          userRSVPed = true;
        }
        await pool.query('UPDATE rooms SET rsvp_users_json = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(rsvps), roomId]);
        return { rsvps, userRSVPed };
      }
    } catch (err) {
      console.error('[DB] Error toggling RSVP in Postgres:', err.message);
    }
  } else {
    const db = loadLocalDB();
    const room = db.rooms ? db.rooms.find(r => r.id === roomId) : null;
    if (room) {
      if (!room.rsvpUsers) room.rsvpUsers = [];
      const existingIdx = room.rsvpUsers.findIndex(u => u.name === user.name || (user.id && u.id === user.id));
      let userRSVPed = false;
      if (existingIdx >= 0) {
        room.rsvpUsers.splice(existingIdx, 1);
        userRSVPed = false;
      } else {
        room.rsvpUsers.push({
          name: user.name,
          avatar: user.avatar,
          time: Date.now()
        });
        userRSVPed = true;
      }
      saveLocalDB(db);
      return { rsvps: room.rsvpUsers, userRSVPed };
    }
  }
  return { rsvps: [], userRSVPed: false };
}

module.exports = {
  initDB,
  loadRooms,
  saveRoom,
  deleteRoom,
  toggleRSVP
};
