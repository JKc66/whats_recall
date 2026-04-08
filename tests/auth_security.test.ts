process.env.NODE_ENV = "test"; // Must be FIRST
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Setup temporary directory for test database/media
const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-auth-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { expect, test, describe, beforeEach, afterEach, spyOn, mock, beforeAll, afterAll } from "bun:test";

const { getDb } = await import("../src/db/database.ts");
const { createHonoServer } = await import("../src/api/server.ts");
const { authMiddleware } = await import("../src/api/middleware.ts");

describe("AUTH_PASSWORD Security", () => {
    let originalAuthPassword: string | undefined;
    let exitSpy: any;
    const db = getDb();

    beforeEach(async () => {
        await db.clearAllData();
        originalAuthPassword = process.env.AUTH_PASSWORD;
        exitSpy = spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit called");
        });
    });

    afterEach(() => {
        process.env.AUTH_PASSWORD = originalAuthPassword;
        if (exitSpy) exitSpy.mockRestore();
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("should exit if AUTH_PASSWORD is not set", () => {
        delete process.env.AUTH_PASSWORD;
        expect(() => createHonoServer({} as any)).toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test("should exit if AUTH_PASSWORD is 'changeme'", () => {
        process.env.AUTH_PASSWORD = "changeme";
        expect(() => createHonoServer({} as any)).toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test("should NOT exit if AUTH_PASSWORD is set to a secure value", () => {
        process.env.AUTH_PASSWORD = "a-secure-password-123";
        const server = createHonoServer({} as any);
        expect(exitSpy).not.toHaveBeenCalled();
        expect(server).toBeDefined();
    });
});

describe("Fingerprint Enforcement", () => {
    const db = getDb();
    const createMockContext = (headers: Record<string, string> = {}) => {
        const h = new Headers(headers);
        return {
            req: {
                path: "/api/chats",
                header: (name: string) => h.get(name),
                raw: { headers: h }
            },
            json: mock((data: any, status: number) => ({ data, status })),
        };
    };

    beforeEach(async () => {
        await db.clearAllData();
    });

    test("should reject if session has fingerprint but client provides none", async () => {
        db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run("valid-token", "secure-fp-123");
        const c = createMockContext({ "X-Auth-Token": "valid-token" });
        await expect(authMiddleware(c as any, async () => {})).rejects.toThrow();
    });

    test("should reject if session has fingerprint but client provides wrong one", async () => {
        db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run("valid-token", "secure-fp-123");
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "wrong-fp"
        });
        await expect(authMiddleware(c as any, async () => {})).rejects.toThrow();
    });

    test("should allow if fingerprints match", async () => {
        db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run("valid-token", "secure-fp-123");
        const next = mock(async () => {});
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "secure-fp-123"
        });
        await authMiddleware(c as any, next as any);
        expect(next).toHaveBeenCalled();
    });
});
