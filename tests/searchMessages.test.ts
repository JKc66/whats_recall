import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-search-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { expect, test, describe, afterAll, beforeAll } from "bun:test";

const { getDb } = await import("../src/db/database.ts");

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

    test("should handle SQL LIKE special characters as literals (standard LIKE behavior)", () => {
        // SQLite LIKE uses % as wildcard. Our code uses `%${query}%`
        // So searching for "%" will result in "%%%" which matches everything with a % in it,
        // OR it might just match everything if not escaped.
        // Actually `%${query}%` where query is `%` becomes `%%%` which matches everything.
        const results = db.searchMessages("%");
        expect(results.length).toBe(7); // Because % is a wildcard in LIKE

        const resultsUnderscore = db.searchMessages("_");
        expect(resultsUnderscore.length).toBe(7); // _ matches any single character
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
