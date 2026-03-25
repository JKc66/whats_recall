import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-db-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { expect, test, describe, afterAll, beforeAll } from "bun:test";

const { initDatabase, MEDIA_DIR } = await import("../src/database.js");

describe("database clearAllData", () => {
    let db;

    beforeAll(() => {
        db = initDatabase();
    });

    afterAll(() => {
        if (db) {
            db.close();
        }
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("should clear messages, chats, reactions, and media", async () => {
        // 1. Insert dummy data
        const chatId = "12345@c.us";
        const messageId = "MSG123";
        const senderId = "67890@c.us";

        db.upsertChat(chatId, "Test Chat", false);

        db.saveMessage({
            message_id: messageId,
            chat_id: chatId,
            sender_id: senderId,
            sender_name: "Test Sender",
            body: "Hello World",
            type: "chat",
            has_media: false,
            timestamp: 1234567890,
            is_from_me: false,
            is_view_once: false
        });

        db.addReaction(messageId, senderId, "Test Sender", "👍");

        // 2. Create a dummy media file
        const testMediaFile = join(MEDIA_DIR, "test-media.jpg");
        writeFileSync(testMediaFile, "dummy content");

        // Verify data was inserted
        const chats = db.getChats();
        expect(chats.length).toBe(1);

        const messages = db.getMessages(chatId);
        expect(messages.length).toBe(1);

        // reactions are included in getMessages
        expect(messages[0].reactions.length).toBe(1);
        expect(messages[0].reactions[0].emoji).toBe("👍");

        expect(existsSync(testMediaFile)).toBe(true);

        // 3. Call clearAllData
        await db.clearAllData();

        // 4. Verify data was cleared
        const chatsAfter = db.getChats();
        expect(chatsAfter.length).toBe(0);

        const messagesAfter = db.getMessages(chatId);
        expect(messagesAfter.length).toBe(0);

        // Verify media directory is recreated but empty
        expect(existsSync(MEDIA_DIR)).toBe(true);
        expect(existsSync(testMediaFile)).toBe(false);
    });
});
