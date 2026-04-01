process.env.NODE_ENV = "test";
process.env.AUTH_PASSWORD = "testpassword";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-server-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");
process.env.MEDIA_DIR = join(tempDir, "media");
process.env.PUBLIC_DIR = join(tempDir, "public");

import { getDb } from "../src/db/database.ts";
import { createHonoServer } from "../src/api/server.ts";

describe("API Server Routes", () => {
    let db: any;
    let mockClient: any;
    let app: any;
    const testToken = "test-token";
    const testFp = "test-fp";

    beforeAll(async () => {
        db = getDb();
        mockClient = {
            isReady: true,
            isAuthenticated: true,
            myId: "testuser",
            getPairingData: () => ({}),
            reset: async () => {},
            getWhatsAppChats: async () => [],
            deleteChatFully: async () => {}
        };
        const server = createHonoServer(mockClient);
        app = server.app;
        
        if (!process.env.MEDIA_DIR) throw new Error("MEDIA_DIR not set");
        mkdirSync(process.env.MEDIA_DIR, { recursive: true });
        mkdirSync(process.env.PUBLIC_DIR!, { recursive: true });

        // Create a valid session
        db.createSession(testToken, testFp, "2099-01-01 00:00:00");
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    const authenticatedRequest = (path: string, options: any = {}) => {
        return app.request(path, {
            ...options,
            headers: {
                ...options.headers,
                "X-Auth-Token": testToken,
                "X-Fingerprint": testFp
            }
        });
    };

    test("GET /api/status should return status", async () => {
        const res = await authenticatedRequest("/api/status");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.connected).toBe(true);
        expect(json.myId).toBe("testuser");
    });

    test("GET /api/media/:filename should return media", async () => {
        const testFile = "test.txt";
        const fullPath = join(process.env.MEDIA_DIR!, testFile);
        writeFileSync(fullPath, "hello world");

        const res = await authenticatedRequest("/api/media/test.txt");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("hello world");
    });

    test("GET /api/media/:filename with traversal should return 400", async () => {
        // Use double encoded traversal so it decodes to '..' in our safePath
        const res = await authenticatedRequest("/api/media/path/%252E%252E/test.txt");
        expect(res.status).toBe(400);
    });

    test("DELETE /api/data should require password", async () => {
        const res = await authenticatedRequest("/api/data", {
            method: "DELETE",
            body: JSON.stringify({ password: "wrong" }),
            headers: { "Content-Type": "application/json" }
        });
        expect(res.status).toBe(403);
    });

    test("DELETE /api/data should clear data with correct password", async () => {
        db.upsertChat("chat1", "User 1", false);
        const res = await authenticatedRequest("/api/data", {
            method: "DELETE",
            body: JSON.stringify({ password: "testpassword" }),
            headers: { "Content-Type": "application/json" }
        });
        expect(res.status).toBe(200);
        expect(db.getChats()).toHaveLength(0);
    });
    
    test("SPA Fallback should return 404 when index.html is missing", async () => {
        const res = await app.request("/some-random-route");
        expect(res.status).toBe(404);
    });

    test("SPA Fallback should return index.html when it exists", async () => {
        const indexPath = join(process.env.PUBLIC_DIR!, "index.html");
        writeFileSync(indexPath, "<html><body>SPA</body></html>");
        
        const res = await app.request("/dashboard");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("<html><body>SPA</body></html>");
        
        rmSync(indexPath);
    });
});
