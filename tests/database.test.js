import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
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

describe("database deleteChatAndMessages", () => {
    let db;

    beforeAll(() => {
        db = initDatabase();
    });

    afterAll(() => {
        if (db) {
            db.close();
        }
    });

    test("should delete chat, messages, reactions, exclusive media, and profile pic, but preserve shared media", async () => {
        const chat1 = "chat1@c.us";
        const chat2 = "chat2@c.us";

        // Create media files
        const sharedMedia = "shared.jpg";
        const exclusiveMedia = "exclusive.jpg";
        const profilePic = "profile.jpg";

        if (!existsSync(MEDIA_DIR)) {
            mkdirSync(MEDIA_DIR, { recursive: true });
        }

        writeFileSync(join(MEDIA_DIR, sharedMedia), "shared");
        writeFileSync(join(MEDIA_DIR, exclusiveMedia), "exclusive");
        writeFileSync(join(MEDIA_DIR, profilePic), "profile");

        db.upsertChat(chat1, "Chat 1", false);
        db.updateChatProfilePic(chat1, profilePic);

        db.upsertChat(chat2, "Chat 2", false);

        // Message with exclusive media for chat1
        db.saveMessage({
            message_id: "MSG1_CHAT1",
            chat_id: chat1,
            sender_id: "sender@c.us",
            sender_name: "Sender",
            body: "Exclusive",
            type: "image",
            has_media: true,
            media_path: exclusiveMedia,
            timestamp: 1000,
            is_from_me: false,
            is_view_once: false
        });

        // Message with shared media for chat1
        db.saveMessage({
            message_id: "MSG2_CHAT1",
            chat_id: chat1,
            sender_id: "sender@c.us",
            sender_name: "Sender",
            body: "Shared",
            type: "image",
            has_media: true,
            media_path: sharedMedia,
            timestamp: 1001,
            is_from_me: false,
            is_view_once: false
        });

        // Message with shared media for chat2
        db.saveMessage({
            message_id: "MSG1_CHAT2",
            chat_id: chat2,
            sender_id: "sender@c.us",
            sender_name: "Sender",
            body: "Shared",
            type: "image",
            has_media: true,
            media_path: sharedMedia,
            timestamp: 1002,
            is_from_me: false,
            is_view_once: false
        });

        // Add a reaction to chat1 message
        db.addReaction("MSG1_CHAT1", "sender@c.us", "Sender", "🔥");

        // Verify initial state
        expect(db.getChats().length).toBe(2);
        expect(db.getMessages(chat1).length).toBe(2);
        expect(existsSync(join(MEDIA_DIR, sharedMedia))).toBe(true);
        expect(existsSync(join(MEDIA_DIR, exclusiveMedia))).toBe(true);
        expect(existsSync(join(MEDIA_DIR, profilePic))).toBe(true);

        // Verify reaction
        const msgs = db.getMessages(chat1);
        const msg1 = msgs.find(m => m.message_id === "MSG1_CHAT1");
        expect(msg1.reactions.length).toBe(1);

        // Delete chat1
        await db.deleteChatAndMessages(chat1);

        // Verify chat1 is gone but chat2 remains
        const chats = db.getChats();
        expect(chats.length).toBe(1);
        expect(chats[0].chat_id).toBe(chat2);

        // Verify chat1 messages and reactions are gone
        expect(db.getMessages(chat1).length).toBe(0);

        // Verify exclusive media and profile pic are deleted
        expect(existsSync(join(MEDIA_DIR, exclusiveMedia))).toBe(false);
        expect(existsSync(join(MEDIA_DIR, profilePic))).toBe(false);

        // Verify shared media is preserved
        expect(existsSync(join(MEDIA_DIR, sharedMedia))).toBe(true);
    });
});
