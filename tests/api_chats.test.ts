process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-chats-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { getDb, dbInstances } from "../src/db/database.ts";
import chatsApi from "../src/api/chats.ts";
import { apiRateLimits } from "../src/api/utils.ts";

describe("API /chats", () => {
    let db: any;
    let mockClient: any;
    let chats: any;

    beforeAll(async () => {
        
        db = getDb();
        mockClient = {
            myId: "me123@s.whatsapp.net"
        };
        chats = chatsApi(mockClient);
    });

    beforeEach(async () => {
        await db.clearAllData();
        apiRateLimits.clear();
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("GET / should return list of chats", async () => {
        db.upsertChat("chat1", "User 1", false);
        db.upsertChat("chat2", "Group 1", true);

        const res = await chats.request("/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.chats).toHaveLength(2);
        expect(json.chats.map((c: any) => c.chat_id)).toContain("chat1");
        expect(json.chats.map((c: any) => c.chat_id)).toContain("chat2");
    });

    test("GET / should correctly identify isMe", async () => {
        db.upsertChat(mockClient.myId, "Me", false);
        db.upsertChat("lid123@lid", "LID Variant", false); // Test LID variant matching my number part
        // mockClient.myId = me123@s.whatsapp.net, number part is me123
        db.upsertChat("me123@lid", "LID of Me", false);

        const res = await chats.request("/");
        const json = await res.json();
        
        const myChat = json.chats.find((c: any) => c.chat_id === mockClient.myId);
        expect(myChat.isMe).toBe(true);

        const lidOfMe = json.chats.find((c: any) => c.chat_id === "me123@lid");
        expect(lidOfMe.isMe).toBe(true);

        const otherLid = json.chats.find((c: any) => c.chat_id === "lid123@lid");
        expect(otherLid.isMe).toBe(false);
    });

    test("GET /search should find messages", async () => {
        db.upsertChat("chat1", "User 1", false);
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, datetime('now'))")
              .run("msg1", "chat1", "Hello world");
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, datetime('now'))")
              .run("msg2", "chat1", "Another message");

        const res = await chats.request("/search?q=world");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages).toHaveLength(1);
        expect(json.messages[0].body).toBe("Hello world");
    });

    test("GET /search should return 429 when rate limited", async () => {
        for (let i = 0; i < 30; i++) {
            await chats.request("/search?q=test");
        }
        const res = await chats.request("/search?q=test");
        expect(res.status).toBe(429);
    });

    test("GET /deleted should return deleted messages", async () => {
        db.upsertChat("chat1", "User 1", false);
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp, is_deleted) VALUES (?, ?, ?, datetime('now'), 1)")
              .run("msg-del", "chat1", "Deleted msg");
        
        const res = await chats.request("/deleted");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages).toHaveLength(1);
        expect(json.messages[0].message_id).toBe("msg-del");
    });

    test("GET /:chatId/messages should return messages for a chat", async () => {
        db.upsertChat("chat1", "User 1", false);
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, datetime('now'))")
              .run("msg1", "chat1", "Msg 1");
        
        const res = await chats.request("/chat1/messages");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages).toHaveLength(1);
        expect(json.messages[0].body).toBe("Msg 1");
    });

    test("POST /:chatId/read should mark chat as seen", async () => {
        db.upsertChat("chat1", "User 1", false);
        
        const res = await chats.request("/chat1/read", { method: "POST" });
        expect(res.status).toBe(200);
        
        const chat = db.raw.query("SELECT last_seen_deleted_at FROM chats WHERE chat_id = 'chat1'").get() as any;
        expect(chat.last_seen_deleted_at).toBeDefined();
        expect(chat.last_seen_deleted_at).not.toBeNull();
    });
});
