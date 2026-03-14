import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { rmSync, existsSync, statSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";


describe("Database initDatabase", () => {
  let initDatabase;
  let originalDataDir;
  let originalDbPath;
  const TEST_INIT_DATA_DIR = join(process.cwd(), "test-init-data");
  const TEST_INIT_MEDIA_DIR = join(TEST_INIT_DATA_DIR, "media");
  const TEST_INIT_DB_PATH = join(TEST_INIT_DATA_DIR, "init-test.db");

  beforeAll(async () => {
    originalDataDir = process.env.DATA_DIR;
    originalDbPath = process.env.DB_PATH;

    process.env.DATA_DIR = TEST_INIT_DATA_DIR;
    process.env.DB_PATH = TEST_INIT_DB_PATH;

    // Dynamic import to respect env vars
    const module = await import("./database.js");
    initDatabase = module.initDatabase;
  });

  afterAll(() => {
    if (existsSync(TEST_INIT_DATA_DIR)) {
      rmSync(TEST_INIT_DATA_DIR, { recursive: true, force: true });
    }
    if (originalDataDir !== undefined) process.env.DATA_DIR = originalDataDir;
    else delete process.env.DATA_DIR;
    if (originalDbPath !== undefined) process.env.DB_PATH = originalDbPath;
    else delete process.env.DB_PATH;
  });

  test("should create data and media directories", () => {
    if (existsSync(TEST_INIT_DATA_DIR)) rmSync(TEST_INIT_DATA_DIR, { recursive: true, force: true });
    const db = initDatabase();

    expect(existsSync(TEST_INIT_DATA_DIR)).toBe(true);
    expect(existsSync(TEST_INIT_MEDIA_DIR)).toBe(true);
    expect(statSync(TEST_INIT_DATA_DIR).isDirectory()).toBe(true);
    expect(statSync(TEST_INIT_MEDIA_DIR).isDirectory()).toBe(true);

    db.close();
  });

  test("should initialize database schema correctly", () => {
    const dbInstance = initDatabase();
    expect(existsSync(TEST_INIT_DB_PATH)).toBe(true);

    const sqliteDb = new Database(TEST_INIT_DB_PATH);

    // Check if tables were created
    const tables = sqliteDb.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain("chats");
    expect(tableNames).toContain("messages");
    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("monitored_chats");

    sqliteDb.close();
    dbInstance.close();
  });

  test("should be idempotent (can be called multiple times without error)", () => {
    expect(() => {
      const db1 = initDatabase();
      const db2 = initDatabase();
      db1.close();
      db2.close();
    }).not.toThrow();
  });
});

describe("Database upsertChat", () => {


  let db;
  let initDatabase;
  let originalDataDir;
  let originalDbPath;
  const TEST_DATA_DIR = join(process.cwd(), "test-data");
  const TEST_DB_PATH = join(TEST_DATA_DIR, "test.db");

  beforeAll(async () => {
    // Save original environment variables
    originalDataDir = process.env.DATA_DIR;
    originalDbPath = process.env.DB_PATH;

    // Set environment variables BEFORE importing initDatabase
    process.env.DATA_DIR = TEST_DATA_DIR;
    process.env.DB_PATH = TEST_DB_PATH;

    // Dynamic import to ensure process.env is respected during module evaluation
    const module = await import("./database.js");
    initDatabase = module.initDatabase;
    db = initDatabase();
  });

  afterAll(() => {
    if (db) db.close();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }

    // Restore original environment variables
    if (originalDataDir !== undefined) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }

    if (originalDbPath !== undefined) {
      process.env.DB_PATH = originalDbPath;
    } else {
      delete process.env.DB_PATH;
    }
  });

  test("should insert a new chat", () => {
    const chatId = `new-chat-${Date.now()}@c.us`;
    const name = "Test User";
    const isGroup = false;

    db.upsertChat(chatId, name, isGroup);

    const chats = db.getChats();
    const chat = chats.find(c => c.chat_id === chatId);

    expect(chat).toBeDefined();
    expect(chat.name).toBe(name);
    expect(chat.is_group).toBe(0);
  });

  test("should update an existing chat", () => {
    const chatId = `update-chat-${Date.now()}@c.us`;
    db.upsertChat(chatId, "Old Name", false);

    const newName = "Updated Test User";
    db.upsertChat(chatId, newName, true);

    const chats = db.getChats();
    const chat = chats.find(c => c.chat_id === chatId);

    expect(chat.name).toBe(newName);
    expect(chat.is_group).toBe(1);
  });

  test("should preserve name if new name is null (COALESCE check)", () => {
    const chatId = `coalesce-chat-${Date.now()}@c.us`;
    const originalName = "Original Name";

    db.upsertChat(chatId, originalName, false);
    db.upsertChat(chatId, null, true);

    const chats = db.getChats();
    const chat = chats.find(c => c.chat_id === chatId);

    expect(chat.name).toBe(originalName);
    expect(chat.is_group).toBe(1);
  });

  test("should update timestamps", async () => {
    const chatId = `timestamp-chat-${Date.now()}@c.us`;
    db.upsertChat(chatId, "Timestamp Test", false);

    const chatBefore = db.getChats().find(c => c.chat_id === chatId);
    const lastMessageAtBefore = chatBefore.last_message_at;

    // Wait 1.1s because SQLite datetime('now') resolution is seconds
    await new Promise(resolve => setTimeout(resolve, 1100));

    db.upsertChat(chatId, "Timestamp Test Updated", false);

    const chatAfter = db.getChats().find(c => c.chat_id === chatId);

    expect(new Date(chatAfter.last_message_at).getTime()).toBeGreaterThan(new Date(lastMessageAtBefore).getTime());
  });
});
