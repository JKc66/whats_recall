process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-chats-limit-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { getDb } from "../src/db/database.ts";
import chatsApi from "../src/api/chats.ts";
import { apiRateLimits } from "../src/api/utils.ts";

describe("API /chats limit parameters", () => {
    let db: any;
    let mockClient: any;
    let chats: any;

    beforeAll(async () => {
        db = getDb();
        mockClient = { myId: "me123@s.whatsapp.net" };
        chats = chatsApi(mockClient);
    });

    beforeEach(async () => {
        await db.clearAllData();
        apiRateLimits.clear();
        db.upsertChat("chat1", "User 1", false);
        for (let i = 0; i < 1500; i++) {
            db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp, is_deleted) VALUES (?, ?, ?, datetime('now', '-' || ? || ' seconds'), 1)")
              .run(`msg-${i}`, "chat1", `Msg ${i}`, i);
        }
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("GET /deleted should clamp limit to 1000", async () => {
        const res = await chats.request("/deleted?limit=2000");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages.length).toBe(1000); // Because it clamped to 1000
    });

    test("GET /deleted should handle limit=NaN gracefully", async () => {
        const res = await chats.request("/deleted?limit=abc");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages.length).toBe(50); // Fallback to 50
    });

    test("GET /:chatId/messages should clamp limit to 1000", async () => {
        const res = await chats.request("/chat1/messages?limit=2000");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages.length).toBe(1000); // Clamped to 1000
    });

    test("GET /:chatId/messages should handle limit=NaN gracefully", async () => {
        const res = await chats.request("/chat1/messages?limit=abc");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages.length).toBe(200); // Fallback to 200
    });

    test("GET /:chatId/messages should handle before=NaN gracefully", async () => {
        const res = await chats.request("/chat1/messages?before=abc");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.messages.length).toBe(200);
    });
});
