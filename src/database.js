import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const MEDIA_DIR = join(DATA_DIR, 'media');
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'messages.db');

export { MEDIA_DIR, DATA_DIR };

export function initDatabase() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER DEFAULT 0,
      last_message_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender_id TEXT,
      sender_name TEXT,
      body TEXT,
      type TEXT DEFAULT 'chat',
      has_media INTEGER DEFAULT 0,
      media_type TEXT,
      media_filename TEXT,
      media_path TEXT,
      timestamp INTEGER NOT NULL,
      is_from_me INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      is_view_once INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      fingerprint TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitored_chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      emoji TEXT NOT NULL DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, sender_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec('ALTER TABLE messages ADD COLUMN is_view_once INTEGER DEFAULT 0');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN original_id TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_original_id ON messages(original_id)');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE chats ADD COLUMN profile_pic TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE chats ADD COLUMN last_seen_deleted_at INTEGER');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN quoted_stanza_id TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN quoted_sender TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN quoted_preview TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN media_sha256 TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_media_sha256 ON messages(media_sha256)');
  } catch { /* already exists */ }

  // Initial Seed from .env
  const seed = (key, val) => {
    db.query('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, val);
  };
  seed('whatsapp_phone', process.env.WHATSAPP_PHONE || '');
  seed('whatsapp_notify', process.env.NOTIFY_WHATSAPP || 'false');

  return {
    upsertChat(chatId, name, isGroup) {
      db.query(`
        INSERT INTO chats (chat_id, name, is_group, last_message_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(chat_id) DO UPDATE SET
          name = COALESCE(excluded.name, chats.name),
          is_group = excluded.is_group,
          last_message_at = datetime('now'),
          updated_at = datetime('now')
      `).run(chatId, name, isGroup ? 1 : 0);
    },

    saveMessage(msg) {
      db.query(`
        INSERT OR IGNORE INTO messages
        (message_id, chat_id, sender_id, sender_name, body, type, has_media,
         media_type, media_filename, media_path, media_sha256, timestamp, is_from_me, is_view_once, original_id,
         quoted_stanza_id, quoted_sender, quoted_preview)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.message_id, msg.chat_id, msg.sender_id, msg.sender_name,
        msg.body, msg.type, msg.has_media ? 1 : 0,
        msg.media_type, msg.media_filename, msg.media_path, msg.media_sha256 || null,
        msg.timestamp, msg.is_from_me ? 1 : 0, msg.is_view_once ? 1 : 0, msg.original_id || null,
        msg.quoted_stanza_id || null, msg.quoted_sender || null, msg.quoted_preview || null
      );
    },

    markDeleted(messageId) {
      db.query(`
        UPDATE messages SET is_deleted = 1, deleted_at = datetime('now')
        WHERE message_id = ?
      `).run(messageId);
    },

    getMessage(messageId) {
      return db.query('SELECT * FROM messages WHERE message_id = ?').get(messageId);
    },

    getMessageByOriginalId(originalId) {
      return db.query('SELECT * FROM messages WHERE original_id = ?').get(originalId);
    },

    getChat(chatId) {
      return db.query(`
        SELECT * FROM (
          SELECT chat_id, name, is_group FROM chats WHERE chat_id = ?
          UNION
          SELECT chat_id, name, is_group FROM monitored_chats WHERE chat_id = ?
        ) LIMIT 1
      `).get(chatId, chatId);
    },

    getMediaBySha256(sha256) {
      return db.query('SELECT media_path, media_type, media_filename FROM messages WHERE media_sha256 = ? AND media_path IS NOT NULL LIMIT 1').get(sha256);
    },

    getChats() {
      return db.query(`
        SELECT c.*,
          (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.chat_id = c.chat_id
              AND m.is_deleted = 1
              AND (c.last_seen_deleted_at IS NULL OR m.timestamp > c.last_seen_deleted_at)
          ) as deleted_count,
          (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.chat_id = c.chat_id
              AND m.is_deleted = 1
          ) as total_deleted_count,
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.chat_id) as total_messages,
          (SELECT body FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_preview,
          (SELECT sender_name FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_sender
        FROM (
          SELECT * FROM chats
          UNION
          SELECT mc.chat_id, mc.name, mc.is_group, NULL as last_message_at,
                 mc.added_at as created_at, mc.added_at as updated_at,
                 NULL as profile_pic, NULL as last_seen_deleted_at
          FROM monitored_chats mc
          WHERE mc.chat_id NOT IN (SELECT chat_id FROM chats)
        ) c
        ORDER BY c.last_message_at DESC
      `).all();
    },

    markChatDeletedAsSeen(chatId) {
      db.query(`
        UPDATE chats SET last_seen_deleted_at = strftime('%s', 'now') WHERE chat_id = ?
      `).run(chatId);
    },

    getMessages(chatId, limit = 100, before = null) {
      let msgs;
      if (before) {
        msgs = db.query(`
          SELECT * FROM messages WHERE chat_id = ? AND timestamp < ?
          ORDER BY timestamp DESC LIMIT ?
        `).all(chatId, before, limit).reverse();
      } else {
        msgs = db.query(`
          SELECT * FROM messages WHERE chat_id = ?
          ORDER BY timestamp DESC LIMIT ?
        `).all(chatId, limit).reverse();
      }
      // Attach reactions to each message
      if (msgs.length > 0) {
        const ids = msgs.map(m => m.message_id);
        const placeholders = ids.map(() => '?').join(',');
        const reactions = db.query(`SELECT * FROM reactions WHERE message_id IN (${placeholders}) AND emoji != ''`).all(...ids);
        const reactionMap = {};
        for (const r of reactions) {
          if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
          reactionMap[r.message_id].push({ sender_id: r.sender_id, sender_name: r.sender_name, emoji: r.emoji });
        }
        for (const m of msgs) {
          m.reactions = reactionMap[m.message_id] || [];
        }
      }
      return msgs;
    },

    getDeletedMessages(limit = 50) {
      return db.query(`
        SELECT m.*, c.name as chat_name, c.is_group
        FROM messages m
        JOIN chats c ON m.chat_id = c.chat_id
        WHERE m.is_deleted = 1
        ORDER BY m.deleted_at DESC
        LIMIT ?
      `).all(limit);
    },

    getStats() {
      const total = db.query('SELECT COUNT(*) as count FROM messages').get();
      const deleted = db.query('SELECT COUNT(*) as count FROM messages WHERE is_deleted = 1').get();
      const chats = db.query('SELECT COUNT(*) as count FROM chats').get();
      return {
        totalMessages: total.count,
        deletedMessages: deleted.count,
        totalChats: chats.count,
      };
    },

    createSession(token, fingerprint, expiresAt) {
      db.query(`
        INSERT INTO sessions (token, fingerprint, expires_at)
        VALUES (?, ?, ?)
      `).run(token, fingerprint, expiresAt);
    },

    getSession(token) {
      return db.query(`
        SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')
      `).get(token);
    },

    deleteSession(token) {
      db.query('DELETE FROM sessions WHERE token = ?').run(token);
    },

    cleanExpiredSessions() {
      db.query("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
    },

    searchMessages(query, limit = 50) {
      return db.query(`
        SELECT m.*, c.name as chat_name, c.is_group
        FROM messages m
        JOIN chats c ON m.chat_id = c.chat_id
        WHERE m.body LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `).all(`%${query}%`, limit);
    },

    addMonitoredChat(chatId, name, isGroup) {
      db.query(`
        INSERT OR REPLACE INTO monitored_chats (chat_id, name, is_group)
        VALUES (?, ?, ?)
      `).run(chatId, name, isGroup ? 1 : 0);
    },

    removeMonitoredChat(chatId) {
      db.query('DELETE FROM monitored_chats WHERE chat_id = ?').run(chatId);
    },

    getMonitoredChats() {
      return db.query('SELECT * FROM monitored_chats ORDER BY added_at DESC').all();
    },

    isMonitored(chatId) {
      const row = db.query('SELECT 1 FROM monitored_chats WHERE chat_id = ?').get(chatId);
      return !!row;
    },

    addReaction(messageId, senderId, senderName, emoji) {
      if (emoji) {
        db.query(`
          INSERT OR REPLACE INTO reactions (message_id, sender_id, sender_name, emoji)
          VALUES (?, ?, ?, ?)
        `).run(messageId, senderId, senderName, emoji);
      } else {
        // Empty emoji = reaction removed
        db.query('DELETE FROM reactions WHERE message_id = ? AND sender_id = ?').run(messageId, senderId);
      }
    },

    getChatProfilePics(chatIds) {
      if (!chatIds || chatIds.length === 0) return {};
      const placeholders = chatIds.map(() => '?').join(',');
      const rows = db.query(`SELECT chat_id, profile_pic FROM chats WHERE chat_id IN (${placeholders}) AND profile_pic IS NOT NULL`).all(...chatIds);
      return rows.reduce((acc, row) => {
        acc[row.chat_id] = row.profile_pic;
        return acc;
      }, {});
    },
    getChatProfilePic(chatId) {
      const row = db.query('SELECT profile_pic FROM chats WHERE chat_id = ?').get(chatId);
      return row?.profile_pic || null;
    },

    updateChatProfilePic(chatId, profilePic) {
      db.query('UPDATE chats SET profile_pic = ? WHERE chat_id = ?').run(profilePic, chatId);
    },

    async clearAllData() {
      db.query("DELETE FROM messages").run();
      db.query("DELETE FROM chats").run();
      db.query("DELETE FROM reactions").run();
      try {
        const { rm, mkdir } = await import('fs/promises');
        await rm(MEDIA_DIR, { recursive: true, force: true });
        await mkdir(MEDIA_DIR, { recursive: true });
      } catch (err) {
        console.error('Error clearing media directory:', err);
      }
    },

    getSettings() {
      const rows = db.query("SELECT key, value FROM settings").all();
      const settings = {};
      rows.forEach(r => settings[r.key] = r.value);
      return settings;
    },

    updateSetting(key, value) {
      db.query(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET 
          value = excluded.value, 
          updated_at = datetime('now')
      `).run(key, value);
    },

    close() {
      db.close();
    }
  };
}
