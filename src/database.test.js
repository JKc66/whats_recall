import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { rmSync, existsSync } from "fs";
import { join } from "path";

describe("Database", () => {
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

  describe("upsertChat", () => {
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

  describe("saveMessage", () => {
    test("should successfully save a basic message", () => {
      const msg = {
        messageId: `msg-${Date.now()}-1`,
        chatId: `chat-${Date.now()}@c.us`,
        senderId: `sender-${Date.now()}@c.us`,
        senderName: "Sender Name",
        body: "Hello, world!",
        type: "chat",
        hasMedia: false,
        mediaType: null,
        mediaFilename: null,
        mediaPath: null,
        timestamp: Math.floor(Date.now() / 1000),
        isFromMe: false,
        isViewOnce: false,
        originalId: null
      };

      db.saveMessage(msg);

      const savedMsg = db.getMessage(msg.messageId);
      expect(savedMsg).toBeDefined();
      expect(savedMsg.chat_id).toBe(msg.chatId);
      expect(savedMsg.sender_id).toBe(msg.senderId);
      expect(savedMsg.sender_name).toBe(msg.senderName);
      expect(savedMsg.body).toBe(msg.body);
      expect(savedMsg.type).toBe(msg.type);
      expect(savedMsg.has_media).toBe(0);
      expect(savedMsg.timestamp).toBe(msg.timestamp);
      expect(savedMsg.is_from_me).toBe(0);
      expect(savedMsg.is_view_once).toBe(0);
      expect(savedMsg.original_id).toBeNull();
    });

    test("should correctly convert boolean flags to 1/0", () => {
      const msg = {
        messageId: `msg-${Date.now()}-2`,
        chatId: `chat-${Date.now()}@c.us`,
        senderId: `sender-${Date.now()}@c.us`,
        senderName: "Sender Name",
        body: "Media message",
        type: "image",
        hasMedia: true,
        mediaType: "image/jpeg",
        mediaFilename: "test.jpg",
        mediaPath: "/path/to/test.jpg",
        timestamp: Math.floor(Date.now() / 1000),
        isFromMe: true,
        isViewOnce: true
      };

      db.saveMessage(msg);

      const savedMsg = db.getMessage(msg.messageId);
      expect(savedMsg).toBeDefined();
      expect(savedMsg.has_media).toBe(1);
      expect(savedMsg.is_from_me).toBe(1);
      expect(savedMsg.is_view_once).toBe(1);
    });

    test("should ignore duplicate messages (INSERT OR IGNORE)", () => {
      const msg = {
        messageId: `msg-${Date.now()}-3`,
        chatId: `chat-${Date.now()}@c.us`,
        senderId: `sender-${Date.now()}@c.us`,
        senderName: "Sender Name",
        body: "Original Body",
        type: "chat",
        hasMedia: false,
        timestamp: Math.floor(Date.now() / 1000),
        isFromMe: false,
        isViewOnce: false
      };

      // First insert
      db.saveMessage(msg);
      const savedMsg1 = db.getMessage(msg.messageId);
      expect(savedMsg1.body).toBe("Original Body");

      // Attempt to insert duplicate with different body
      const duplicateMsg = { ...msg, body: "Updated Body" };
      db.saveMessage(duplicateMsg);

      // Verify the body hasn't changed
      const savedMsg2 = db.getMessage(msg.messageId);
      expect(savedMsg2.body).toBe("Original Body");
    });

    test("should save optional fields when provided", () => {
      const msg = {
        messageId: `msg-${Date.now()}-4`,
        chatId: `chat-${Date.now()}@c.us`,
        senderId: `sender-${Date.now()}@c.us`,
        senderName: "Sender Name",
        body: "Original Message",
        type: "chat",
        hasMedia: false,
        timestamp: Math.floor(Date.now() / 1000),
        isFromMe: false,
        isViewOnce: false,
        originalId: `orig-${Date.now()}`
      };

      db.saveMessage(msg);

      const savedMsg = db.getMessage(msg.messageId);
      expect(savedMsg).toBeDefined();
      expect(savedMsg.original_id).toBe(msg.originalId);
    });
  });

});