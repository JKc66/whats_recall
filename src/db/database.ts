import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WhatsAppChat, WhatsAppMessage, AppSettings } from '../types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const MEDIA_DIR_DEFAULT = resolve(join(DATA_DIR, 'media'));

export const MEDIA_DIR = process.env.MEDIA_DIR || MEDIA_DIR_DEFAULT;
export { DATA_DIR };

const dbInstances: Map<string, any> = new Map();

export function getDb(testDbPath?: string, testMediaDir?: string) {
  const currentDbPath = testDbPath || process.env.DB_PATH || join(DATA_DIR, 'messages.db');
  const currentMediaDir = testMediaDir || process.env.MEDIA_DIR || MEDIA_DIR_DEFAULT;

  if (dbInstances.has(currentDbPath)) return dbInstances.get(currentDbPath);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(currentMediaDir)) mkdirSync(currentMediaDir, { recursive: true });

  const db = new Database(currentDbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  dbInstances.set(currentDbPath, db);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      lid TEXT,
      is_group INTEGER DEFAULT 0,
      profile_pic TEXT,
      last_message_at TEXT,
      last_seen_deleted_at INTEGER,
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
      media_sha256 TEXT,
      timestamp INTEGER NOT NULL,
      is_from_me INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      is_view_once INTEGER DEFAULT 0,
      original_id TEXT,
      quoted_stanza_id TEXT,
      quoted_sender TEXT,
      quoted_preview TEXT,
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

    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      emoji TEXT NOT NULL DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, sender_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_original_id ON messages(original_id);
    CREATE INDEX IF NOT EXISTS idx_messages_media_sha256 ON messages(media_sha256);
    CREATE INDEX IF NOT EXISTS idx_messages_media_path ON messages(media_path);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_deleted ON messages(chat_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
  `);

  // Initial Seed
  const seed = (key: string, val: string) => {
    db.query('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, val);
  };
  seed('whatsapp_phone', process.env.WHATSAPP_PHONE || '');
  seed('whatsapp_notify', process.env.NOTIFY_WHATSAPP || 'false');
  seed('whatsapp_pairing_method', process.env.WHATSAPP_PAIRING_METHOD || 'code');

  const dbMethods = {
    // Chat Operations
    upsertChat(chatId: string, name: string, isGroup: boolean, lid: string | null = null) {
      db.query(`
        INSERT INTO chats (chat_id, name, lid, is_group, last_message_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(chat_id) DO UPDATE SET
          name = COALESCE(excluded.name, chats.name),
          lid = COALESCE(excluded.lid, chats.lid),
          is_group = excluded.is_group,
          last_message_at = datetime('now'),
          updated_at = datetime('now')
      `).run(chatId, name, lid, isGroup ? 1 : 0);
    },

    getChat(chatId: string): WhatsAppChat | null {
      return db.query(`
        SELECT * FROM (
          SELECT chat_id, name, is_group, profile_pic, lid FROM chats WHERE chat_id = ?
          UNION
          SELECT chat_id, name, is_group, NULL as profile_pic, NULL as lid FROM monitored_chats WHERE chat_id = ?
        ) LIMIT 1
      `).get(chatId, chatId) as WhatsAppChat | null;
    },

    getChats(): WhatsAppChat[] {
      return db.query(`
        SELECT c.*,
          (
            SELECT COUNT(*) FROM messages m 
            WHERE m.chat_id = c.chat_id 
              AND m.is_deleted = 1 
              AND (c.last_seen_deleted_at IS NULL OR m.timestamp > c.last_seen_deleted_at)
          ) as deleted_count,
          (
            SELECT COUNT(*) FROM messages m 
            WHERE m.chat_id = c.chat_id 
              AND m.is_deleted = 1
          ) as total_deleted_count,
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.chat_id) as total_messages,
          (SELECT body FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_preview,
          (SELECT sender_name FROM messages m WHERE m.chat_id = c.chat_id ORDER BY m.timestamp DESC LIMIT 1) as last_message_sender
        FROM (
          SELECT * FROM chats
          UNION
          SELECT mc.chat_id, mc.name, NULL as lid, mc.is_group, NULL as profile_pic, 
                 NULL as last_message_at, NULL as last_seen_deleted_at,
                 mc.added_at as created_at, mc.added_at as updated_at
          FROM monitored_chats mc
          WHERE mc.chat_id NOT IN (SELECT chat_id FROM chats)
        ) c
        ORDER BY c.last_message_at DESC
      `).all() as WhatsAppChat[];
    },

    // Message Operations
    saveMessage(msg: Partial<WhatsAppMessage>) {
      db.query(`
        INSERT OR IGNORE INTO messages
        (message_id, chat_id, sender_id, sender_name, body, type, has_media,
         media_type, media_filename, media_path, media_sha256, timestamp, is_from_me, is_view_once, original_id,
         quoted_stanza_id, quoted_sender, quoted_preview)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.message_id || '',
        msg.chat_id || '',
        msg.sender_id ?? null,
        msg.sender_name ?? null,
        msg.body ?? null,
        msg.type ?? 'chat',
        msg.has_media ? 1 : 0,
        msg.media_type ?? null,
        msg.media_filename ?? null,
        msg.media_path ?? null,
        msg.media_sha256 ?? null,
        msg.timestamp ?? Math.floor(Date.now() / 1000),
        msg.is_from_me ? 1 : 0,
        msg.is_view_once ? 1 : 0,
        msg.original_id ?? null,
        msg.quoted_stanza_id ?? null,
        msg.quoted_sender ?? null,
        msg.quoted_preview ?? null
      );
    },

    markDeleted(messageId: string) {
      db.query(`
        UPDATE messages SET is_deleted = 1, deleted_at = datetime('now')
        WHERE message_id = ?
      `).run(messageId);
    },

    getMessage(messageId: string): WhatsAppMessage | null {
      return db.query('SELECT * FROM messages WHERE message_id = ?').get(messageId) as WhatsAppMessage | null;
    },

    getMessageByOriginalId(originalId: string): WhatsAppMessage | null {
      return db.query('SELECT * FROM messages WHERE original_id = ?').get(originalId) as WhatsAppMessage | null;
    },

    getMessages(chat_id: string, limit = 100, before: number | null = null): WhatsAppMessage[] {
      const msgs = before
        ? db.query(`SELECT * FROM messages WHERE chat_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`).all(chat_id, before, limit).reverse()
        : db.query(`SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?`).all(chat_id, limit).reverse();

      const messages = msgs as WhatsAppMessage[];
      if (messages.length > 0) {
        const ids = messages.map(m => m.message_id);
        const reactions = db.query(`SELECT * FROM reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) AND emoji != ''`).all(...ids);
        const reactionMap: Record<string, any[]> = {};
        for (const r of reactions as any[]) {
          if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
          reactionMap[r.message_id].push({ sender_id: r.sender_id, sender_name: r.sender_name, emoji: r.emoji });
        }
        for (const m of messages) m.reactions = reactionMap[m.message_id] || [];
      }
      return messages;
    },

    getDeletedMessages(limit = 50): WhatsAppMessage[] {
      return db.query(`
        SELECT m.*, c.name as chat_name, c.is_group
        FROM messages m
        JOIN chats c ON m.chat_id = c.chat_id
        WHERE m.is_deleted = 1
        ORDER BY m.deleted_at DESC
        LIMIT ?
      `).all(limit) as WhatsAppMessage[];
    },

    searchMessages(query: string, limit = 50): WhatsAppMessage[] {
      return db.query(`
        SELECT m.*, c.name as chat_name, c.is_group
        FROM messages m
        JOIN chats c ON m.chat_id = c.chat_id
        WHERE m.body LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `).all(`%${query}%`, limit) as WhatsAppMessage[];
    },

    getMediaBySha256(sha256: string) {
      return db.query('SELECT media_path, media_type, media_filename FROM messages WHERE media_sha256 = ? AND media_path IS NOT NULL LIMIT 1').get(sha256);
    },

    getStats() {
      const messages = (db.query('SELECT COUNT(*) as count FROM messages').get() as any).count;
      const deleted = (db.query('SELECT COUNT(*) as count FROM messages WHERE is_deleted = 1').get() as any).count;
      const chatsCount = (db.query('SELECT COUNT(*) as count FROM chats').get() as any).count;
      return {
        totalMessages: messages,
        deletedMessages: deleted,
        totalChats: chatsCount
      };
    },

    // Monitored Chats
    addMonitoredChat(chatId: string, name: string, isGroup: boolean) {
      db.query('INSERT OR REPLACE INTO monitored_chats (chat_id, name, is_group) VALUES (?, ?, ?)').run(chatId, name, isGroup ? 1 : 0);
    },

    removeMonitoredChat(chatId: string) {
      db.query('DELETE FROM monitored_chats WHERE chat_id = ?').run(chatId);
    },

    getMonitoredChats() {
      return db.query('SELECT mc.*, c.lid FROM monitored_chats mc LEFT JOIN chats c ON mc.chat_id = c.chat_id ORDER BY mc.added_at DESC').all();
    },

    isMonitored(chatId: string): boolean {
      const row = db.query('SELECT 1 FROM monitored_chats WHERE chat_id = ?').get(chatId);
      return !!row;
    },

    // Reactions
    addReaction(messageId: string, senderId: string, senderName: string, emoji: string) {
      if (emoji) {
        db.query(`
          INSERT OR REPLACE INTO reactions (message_id, sender_id, sender_name, emoji)
          VALUES (?, ?, ?, ?)
        `).run(messageId, senderId, senderName, emoji);
      } else {
        db.query('DELETE FROM reactions WHERE message_id = ? AND sender_id = ?').run(messageId, senderId);
      }
    },

    // Profile Pics
    getChatProfilePics(chatIds: string[]): Record<string, string> {
      if (!chatIds || chatIds.length === 0) return {};
      const placeholders = chatIds.map(() => '?').join(',');
      const rows = db.query(`SELECT chat_id, profile_pic FROM chats WHERE chat_id IN (${placeholders}) AND profile_pic IS NOT NULL`).all(...chatIds) as { chat_id: string, profile_pic: string }[];
      return rows.reduce((acc, row) => {
        acc[row.chat_id] = row.profile_pic;
        return acc;
      }, {} as Record<string, string>);
    },

    getChatProfilePic(chatId: string): string | null {
      const row = db.query('SELECT profile_pic FROM chats WHERE chat_id = ?').get(chatId) as any;
      return row?.profile_pic || null;
    },

    updateChatProfilePic(chatId: string, profilePic: string) {
      db.query('UPDATE chats SET profile_pic = ? WHERE chat_id = ?').run(profilePic, chatId);
    },

    markChatDeletedAsSeen(chatId: string) {
      db.query("UPDATE chats SET last_seen_deleted_at = strftime('%s', 'now') WHERE chat_id = ?").run(chatId);
    },

    async deleteChatsAndMessages(chatIds: string[]) {
      if (!chatIds || chatIds.length === 0) return;

      const deleteTx = db.transaction((ids: string[]) => {
        const placeholders = ids.map(() => '?').join(',');

        // Find media paths and profile pics exclusively used by these chats
        const mediaPaths = db.query(`
          WITH TargetMedia AS (
            SELECT media_path as path FROM messages WHERE chat_id IN (${placeholders}) AND media_path IS NOT NULL
            UNION
            SELECT profile_pic as path FROM chats WHERE chat_id IN (${placeholders}) AND profile_pic IS NOT NULL
          )
          SELECT path FROM TargetMedia t
          WHERE NOT EXISTS (
            SELECT 1 FROM messages m
            WHERE m.media_path = t.path
              AND m.chat_id NOT IN (${placeholders})
          )
          AND NOT EXISTS (
            SELECT 1 FROM chats c
            WHERE c.profile_pic = t.path
              AND c.chat_id NOT IN (${placeholders})
          )
        `).all(...ids, ...ids, ...ids, ...ids).map((r: any) => r.path);

        // Delete reactions associated with messages from these chats
        db.query(`
          DELETE FROM reactions
          WHERE message_id IN (
            SELECT message_id FROM messages WHERE chat_id IN (${placeholders})
          )
        `).run(...ids);

        db.query(`DELETE FROM messages WHERE chat_id IN (${placeholders})`).run(...ids);
        db.query(`DELETE FROM chats WHERE chat_id IN (${placeholders})`).run(...ids);

        return mediaPaths;
      });

      const mediaPathsToDelete = deleteTx(chatIds) as string[];

      if (mediaPathsToDelete.length > 0) {
        try {
          const { unlink } = await import('fs/promises');
          await Promise.allSettled(mediaPathsToDelete.map(async (p) => {
            const fullPath = resolve(join(MEDIA_DIR, p));
            if (fullPath.startsWith(MEDIA_DIR) && existsSync(fullPath)) {
              await unlink(fullPath);
            }
          }));
        } catch (err) {
          console.error('Error deleting media files:', err);
        }
      }
    },

    async clearAllData() {
      db.transaction(() => {
        db.query('DELETE FROM messages').run();
        db.query('DELETE FROM chats').run();
        db.query('DELETE FROM reactions').run();
        db.query('DELETE FROM monitored_chats').run();
        db.query('DELETE FROM sessions').run();
      })();
      
      const { rmSync, mkdirSync } = await import('fs');
      if (existsSync(MEDIA_DIR)) {
        rmSync(MEDIA_DIR, { recursive: true, force: true });
      }
      mkdirSync(MEDIA_DIR, { recursive: true });
    },

    // Settings
    getSettings(): AppSettings {
      const rows = db.query("SELECT key, value FROM settings").all() as { key: string, value: string }[];
      return rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    },

    updateSetting(key: string, value: string) {
      db.query(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(key, value);
    },

    // Session Operations
    createSession(token: string, fingerprint: string, expiresAt: string) {
      db.query('INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, ?)').run(token, fingerprint, expiresAt);
    },

    getSession(token: string) {
      return db.query("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
    },

    deleteSession(token: string) {
      db.query('DELETE FROM sessions WHERE token = ?').run(token);
    },

    cleanExpiredSessions() {
      db.query("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
    },

    close() {
      db.close();
    },

    raw: db
  };
  dbInstances.set(currentDbPath, dbMethods);
  return dbMethods;
}
