process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-monitored-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { getDb } from "../src/db/database.ts";
import monitoredRouter from "../src/api/monitored.ts";
import { Hono } from 'hono';
import { evlog, type EvlogVariables } from "evlog/hono";
import { parseError } from "evlog";

describe("API /monitored", () => {
    let db: any;
    let mockClient: any;
    let monitored: any;

    beforeAll(async () => {
        db = getDb();
        mockClient = {
            deleteChatFully: async (chatId: string) => {
                db.removeMonitoredChat(chatId);
            }
        };
        const router = monitoredRouter(mockClient);
        monitored = new Hono<EvlogVariables>();
        monitored.use('*', evlog());
        monitored.onError((err: Error, c: any) => {
            const parsed = parseError(err);
            return c.json({ error: parsed.message }, (parsed.status as any) || 500);
        });
        monitored.route('/', router);
    });

    beforeEach(async () => {
        await db.clearAllData();
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("GET / should return monitored chats", async () => {
        db.addMonitoredChat("chat1", "User 1", false);
        
        const res = await monitored.request("/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.monitored).toHaveLength(1);
        expect(json.monitored[0].chat_id).toBe("chat1");
    });

    test("POST / should add a monitored chat", async () => {
        const res = await monitored.request("/", {
            method: "POST",
            body: JSON.stringify({ chatId: "chat2", name: "User 2", isGroup: false }),
            headers: { "Content-Type": "application/json" }
        });
        
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        
        const monitoredChats = db.getMonitoredChats();
        expect(monitoredChats.some((c: any) => c.chat_id === "chat2")).toBe(true);
    });

    test("DELETE /:chatId should remove a monitored chat", async () => {
        db.addMonitoredChat("chat3", "User 3", false);
        
        const res = await monitored.request("/chat3", {
            method: "DELETE"
        });
        
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        
        expect(db.isMonitored("chat3")).toBe(false);
    });
});
