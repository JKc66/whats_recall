import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { rmSync, existsSync } from "fs";
import { join } from "path";

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
