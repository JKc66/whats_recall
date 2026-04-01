process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-whatsapp-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { getDb } from "../src/db/database.ts";
import whatsappRouter from "../src/api/whatsapp.ts";

describe("API /whatsapp", () => {
    let mockClient: any;
    let whatsapp: any;

    beforeAll(async () => {
        mockClient = {
            getPairingData: () => ({ code: "123456" }),
            reset: async () => {},
            getWhatsAppChats: async () => [{ id: "chat1", name: "User 1" }]
        };
        whatsapp = whatsappRouter(mockClient);
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("GET /pairing should return pairing data", async () => {
        const res = await whatsapp.request("/pairing");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.code).toBe("123456");
    });

    test("POST /reset should reset client", async () => {
        const res = await whatsapp.request("/reset", { method: "POST" });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    test("GET /chats should return WhatsApp chats", async () => {
        const res = await whatsapp.request("/chats");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.chats).toHaveLength(1);
        expect(json.chats[0].id).toBe("chat1");
    });
});
