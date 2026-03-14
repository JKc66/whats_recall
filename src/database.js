import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const MEDIA_DIR = join(DATA_DIR, 'media');
const DB_PATH = join(DATA_DIR, 'messages.db');

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
  `);

  try {
    db.exec('ALTER TABLE messages ADD COLUMN is_view_once INTEGER DEFAULT 0');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE messages ADD COLUMN original_id TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE chats ADD COLUMN profile_pic TEXT');
  } catch { /* already exists */ }

  try {
    db.exec('ALTER TABLE chats ADD COLUMN last_seen_deleted_at TEXT');
  } catch { /* already exists */ }

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
         media_type, media_filename, media_path, timestamp, is_from_me, is_view_once, original_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.messageId, msg.chatId, msg.senderId, msg.senderName,
        msg.body, msg.type, msg.hasMedia ? 1 : 0,
        msg.mediaType, msg.mediaFilename, msg.mediaPath,
        msg.timestamp, msg.isFromMe ? 1 : 0, msg.isViewOnce ? 1 : 0, msg.originalId || null
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
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.chat_id) as total_messages,
          (SELECT body FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_preview,
          (SELECT sender_name FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_sender
        FROM chats c
        ORDER BY c.last_message_at DESC
      `).all();
    },

    markChatDeletedAsSeen(chatId) {
      db.query(`
        UPDATE chats SET last_seen_deleted_at = datetime('now') WHERE chat_id = ?
      `).run(chatId);
    },

    getMessages(chatId, limit = 100, before = null) {
      if (before) {
        return db.query(`
          SELECT * FROM messages WHERE chat_id = ? AND timestamp < ?
          ORDER BY timestamp DESC LIMIT ?
        `).all(chatId, before, limit).reverse();
      }
      return db.query(`
        SELECT * FROM messages WHERE chat_id = ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(chatId, limit).reverse();
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

    getChatProfilePic(chatId) {
      const row = db.query('SELECT profile_pic FROM chats WHERE chat_id = ?').get(chatId);
      return row?.profile_pic || null;
    },

    updateChatProfilePic(chatId, profilePic) {
      db.query('UPDATE chats SET profile_pic = ? WHERE chat_id = ?').run(profilePic, chatId);
    },

    clearAllData() {
      db.exec('DELETE FROM messages');
      db.exec('DELETE FROM chats');
      try {
        for (const file of readdirSync(MEDIA_DIR)) {
          unlinkSync(join(MEDIA_DIR, file));
        }
      } catch { /* media dir may not exist */ }
    },

    close() {
      db.close();
    }
  };
}
