import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-search-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");
process.env.NODE_ENV = "test";

import { expect, test, describe, afterAll, beforeAll } from "bun:test";

const { getDb, dbInstances } = await import("../src/db/database.ts");

describe("database searchMessages", () => {
    let db: any;
    const chatId = "12345@c.us";
    const groupChatId = "group123@g.us";

    beforeAll(async () => {
        
        const dbPath = process.env.DB_PATH;
        db = getDb(dbPath, tempDir);
        await db.clearAllData();

        // Setup initial data
        db.upsertChat(chatId, "Individual Chat", false);
        db.upsertChat(groupChatId, "Group Chat", true);

        const messages = [
            { id: "m1", body: "Hello world", ts: 1000, chat: chatId },
            { id: "m2", body: "How are you?", ts: 2000, chat: chatId },
            { id: "m3", body: "Test message 1", ts: 3000, chat: groupChatId },
            { id: "m4", body: "Another test", ts: 4000, chat: groupChatId },
            { id: "m5", body: "Special characters % and _", ts: 5000, chat: chatId },
            { id: "m6", body: "CASE SENSITIVE", ts: 6000, chat: chatId },
            { id: "m7", body: "case sensitive", ts: 7000, chat: groupChatId },
        ];

        for (const m of messages) {
            db.saveMessage({
                message_id: m.id,
                chat_id: m.chat,
                sender_id: "sender@c.us",
                sender_name: "Sender",
                body: m.body,
                type: "chat",
                has_media: false,
                timestamp: m.ts,
                is_from_me: false,
                is_view_once: false
            });
        }
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("should find messages matching standard query", () => {
        const results = db.searchMessages("world");
        expect(results.length).toBe(1);
        expect(results[0].body).toBe("Hello world");
        expect(results[0].chat_name).toBe("Individual Chat");
    });

    test("should return multiple results ordered by timestamp DESC", () => {
        const results = db.searchMessages("test");
        expect(results.length).toBe(2);
        expect(results[0].message_id).toBe("m4"); // ts 4000
        expect(results[1].message_id).toBe("m3"); // ts 3000
    });

    test("should handle empty query (matches all)", () => {
        const results = db.searchMessages("");
        // Total messages is 7
        expect(results.length).toBe(7);
    });

    test("should handle SQL LIKE special characters as literals (escaped behavior)", () => {
        // Now searching for "%" should ONLY match "Special characters % and _"
        const results = db.searchMessages("%");
        expect(results.length).toBe(1);
        expect(results[0].body).toBe("Special characters % and _");

        const resultsUnderscore = db.searchMessages("_");
        expect(resultsUnderscore.length).toBe(1);
        expect(resultsUnderscore[0].body).toBe("Special characters % and _");
    });

    test("should return empty array when no matches found", () => {
        const results = db.searchMessages("nonexistent");
        expect(results).toEqual([]);
    });

    test("should respect the limit parameter", () => {
        const results = db.searchMessages("test", 1);
        expect(results.length).toBe(1);
        expect(results[0].message_id).toBe("m4");
    });

    test("should be case-insensitive (standard SQLite behavior for ASCII)", () => {
        const results = db.searchMessages("case");
        expect(results.length).toBe(2);
        const bodies = results.map((r: any) => r.body);
        expect(bodies).toContain("CASE SENSITIVE");
        expect(bodies).toContain("case sensitive");
    });
});

describe("database getChats", () => {
    let db: any;
    const chatId1 = "chat1@c.us";
    const chatId2 = "chat2@c.us";
    const chatId3 = "chat3@c.us";

    beforeAll(async () => {
        const dbPath = process.env.DB_PATH;
        db = getDb(dbPath, tempDir);
        await db.clearAllData();

        db.upsertChat(chatId1, "Regular Chat", false);
        db.upsertChat(chatId2, "Chat with % and _", false);
        db.upsertChat(chatId3, "Another Chat", false);
    });

    test("should handle SQL LIKE special characters as literals (escaped behavior)", () => {
        const results = db.getChats("%");
        expect(results.length).toBe(1);
        expect(results[0].name).toBe("Chat with % and _");

        const resultsUnderscore = db.getChats("_");
        expect(resultsUnderscore.length).toBe(1);
        expect(resultsUnderscore[0].name).toBe("Chat with % and _");
    });

    test("should return all chats when query is empty", () => {
        const results = db.getChats("");
        expect(results.length).toBe(3);
    });

    test("should return only matching chats for normal text", () => {
        const results = db.getChats("Regular");
        expect(results.length).toBe(1);
        expect(results[0].name).toBe("Regular Chat");
    });
});
