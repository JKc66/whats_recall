import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

const DATA_DIR = './benchmark_data';
const DB_PATH = join(DATA_DIR, 'benchmark.db');

if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });

const dbConn = new Database(DB_PATH);
dbConn.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      lid TEXT,
      is_group INTEGER DEFAULT 0,
      last_message_at TEXT,
      profile_pic TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS monitored_chats (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
`);

const db = {
    getMonitoredChats: () => dbConn.query('SELECT chat_id FROM monitored_chats').all(),
    getChatProfilePic: (id) => {
        profilePicCalls++;
        const row = dbConn.query('SELECT profile_pic FROM chats WHERE chat_id = ?').get(id);
        return row?.profile_pic || null;
    },
    getChatProfilePics: (ids) => {
        batchProfilePicCalls++;
        if (!ids || ids.length === 0) return {};
        const placeholders = ids.map(() => '?').join(',');
        const rows = dbConn.query(`SELECT chat_id, profile_pic FROM chats WHERE chat_id IN (${placeholders}) AND profile_pic IS NOT NULL`).all(...ids);
        return rows.reduce((acc, row) => {
            acc[row.chat_id] = row.profile_pic;
            return acc;
        }, {});
    },
    getChat: (id) => dbConn.query('SELECT * FROM chats WHERE chat_id = ?').get(id),
    upsertChat: () => {},
    getSettings: () => ({})
};

let profilePicCalls = 0;
let batchProfilePicCalls = 0;

// Mock WhatsApp monitor state
const contacts = new Map();
const chats = new Map();
const lidToPn = new Map();

function resolveToPNLocal(jid) {
    return lidToPn.get(jid) || jid;
}

function isJidGroup(jid) {
    return jid.endsWith('@g.us');
}

async function getChatName(jid) {
    return jid.split('@')[0];
}

async function getProfilePic(jid) {
    return null;
}

// Populate DB
const numChats = 500;
for (let i = 0; i < numChats; i++) {
    const jid = `${i}@s.whatsapp.net`;
    dbConn.query('INSERT INTO chats (chat_id, name, profile_pic) VALUES (?, ?, ?)').run(jid, `User ${i}`, `pic_${i}.jpg`);
    chats.set(jid, { id: jid, name: `User ${i}`, conversationTimestamp: Date.now() });
}

// Current implementation of getWhatsAppChats (simplified for benchmark)
async function getWhatsAppChats_Current() {
    const allChats = Array.from(chats.values());
    const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));

    const results = await Promise.all(allChats
        .map(async c => {
            const isGroup = isJidGroup(c.id);
            let name = c.name || '';

            if (!name || name === c.id.split('@')[0]) {
                name = await getChatName(c.id);
            }

            const ts = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
            return {
                id: c.id,
                name: name,
                isGroup: isGroup,
                timestamp: ts,
                isMonitored: monitored.has(c.id),
                profilePic: db.getChatProfilePic(c.id) || null,
                lid: null
            };
        }));

    return results.sort((a, b) => b.timestamp - a.timestamp);
}

// Optimized implementation of getWhatsAppChats
async function getWhatsAppChats_Optimized() {
    const allChats = Array.from(chats.values());
    const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));

    // Batch fetch profile pics
    const profilePics = db.getChatProfilePics(allChats.map(c => c.id));

    const results = await Promise.all(allChats
        .map(async c => {
            const isGroup = isJidGroup(c.id);
            let name = c.name || '';

            if (!name || name === c.id.split('@')[0]) {
                name = await getChatName(c.id);
            }

            const ts = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
            return {
                id: c.id,
                name: name,
                isGroup: isGroup,
                timestamp: ts,
                isMonitored: monitored.has(c.id),
                profilePic: profilePics[c.id] || null,
                lid: null
            };
        }));

    return results.sort((a, b) => b.timestamp - a.timestamp);
}

async function runBenchmark() {
    console.log(`Benchmarking with ${numChats} chats...`);

    profilePicCalls = 0;
    batchProfilePicCalls = 0;
    let start = performance.now();
    await getWhatsAppChats_Current();
    let end = performance.now();
    console.log(`Current: ${end - start}ms, profilePicCalls: ${profilePicCalls}, batchProfilePicCalls: ${batchProfilePicCalls}`);

    profilePicCalls = 0;
    batchProfilePicCalls = 0;
    start = performance.now();
    await getWhatsAppChats_Optimized();
    end = performance.now();
    console.log(`Optimized: ${end - start}ms, profilePicCalls: ${profilePicCalls}, batchProfilePicCalls: ${batchProfilePicCalls}`);

    // Cleanup
    dbConn.close();
    rmSync(DATA_DIR, { recursive: true, force: true });
}

runBenchmark();
