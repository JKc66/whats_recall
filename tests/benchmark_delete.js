import { performance } from 'perf_hooks';
import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = './benchmark_delete_data';
const DB_PATH = join(DATA_DIR, 'benchmark.db');

if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });

const dbConn = new Database(DB_PATH);
dbConn.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      profile_pic TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      chat_id TEXT,
      media_path TEXT
    );
    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT,
      sender_id TEXT
    );
    CREATE TABLE IF NOT EXISTS monitored_chats (
      chat_id TEXT PRIMARY KEY
    );
`);

// Populate
const CHATS_COUNT = 1000;
const deleteIds = [];
dbConn.transaction(() => {
  for (let i = 0; i < CHATS_COUNT; i++) {
    const chatId = `chat_${i}`;
    dbConn.run('INSERT INTO chats (chat_id, name, profile_pic) VALUES (?, ?, ?)', [chatId, `Name ${i}`, `pic_${i}.jpg`]);
    if (i < 500) {
      deleteIds.push(chatId);
    }
  }
})();

// Original logic
function deleteOriginal(ids) {
  return dbConn.transaction((ids) => {
    const placeholders = ids.map(() => '?').join(',');

    // Omit mediaPaths logic for simplicity, just profilePics
    const profilePicRows = dbConn.query(`SELECT DISTINCT profile_pic FROM chats WHERE chat_id IN (${placeholders}) AND profile_pic IS NOT NULL`).all(...ids);
    const mediaPaths = [];
    for (const row of profilePicRows) {
      const pic = row.profile_pic;
      const picUsedElsewhere = dbConn.query(
        `SELECT 1 FROM chats WHERE profile_pic = ? AND chat_id NOT IN (${placeholders}) LIMIT 1`
      ).get(pic, ...ids);

      const picUsedInMessagesElsewhere = dbConn.query(
        `
          SELECT 1
          FROM messages m
          WHERE m.media_path = ?
            AND m.chat_id NOT IN (${placeholders})
            AND m.media_path IS NOT NULL
          LIMIT 1
        `
      ).get(pic, ...ids);

      if (!picUsedElsewhere && !picUsedInMessagesElsewhere) {
        mediaPaths.push(pic);
      }
    }
    return mediaPaths;
  })(ids);
}

// Optimized logic
function deleteOptimized(ids) {
  return dbConn.transaction((ids) => {
    const placeholders = ids.map(() => '?').join(',');
    const mediaPaths = [];

    const profilePics = dbConn.query(`
      SELECT DISTINCT c.profile_pic
      FROM chats c
      WHERE c.chat_id IN (${placeholders}) AND c.profile_pic IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM chats c2
          WHERE c2.profile_pic = c.profile_pic
            AND c2.chat_id NOT IN (${placeholders})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.media_path = c.profile_pic
            AND m.chat_id NOT IN (${placeholders})
        )
    `).all(...ids, ...ids, ...ids).map(r => r.profile_pic);

    mediaPaths.push(...profilePics);
    return mediaPaths;
  })(ids);
}

const start1 = performance.now();
deleteOriginal(deleteIds);
const end1 = performance.now();
console.log(`Original: ${end1 - start1} ms`);

const start2 = performance.now();
deleteOptimized(deleteIds);
const end2 = performance.now();
console.log(`Optimized: ${end2 - start2} ms`);

dbConn.close();
rmSync(DATA_DIR, { recursive: true, force: true });
