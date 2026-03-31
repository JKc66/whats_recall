import { expect, test, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { getDb } from "../src/db/database.ts";
import { createHonoServer } from "../src/api/server.ts";
import { authMiddleware } from "../src/api/middleware.ts";

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
        exitSpy.mockRestore();
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
        await authMiddleware(c as any, async () => {});
        expect(c.json).toHaveBeenCalledWith({ error: "Fingerprint mismatch or missing" }, 401);
    });

    test("should reject if session has fingerprint but client provides wrong one", async () => {
        db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run("valid-token", "secure-fp-123");
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "wrong-fp"
        });
        await authMiddleware(c as any, async () => {});
        expect(c.json).toHaveBeenCalledWith({ error: "Fingerprint mismatch or missing" }, 401);
    });

    test("should allow if fingerprints match", async () => {
        db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run("valid-token", "secure-fp-123");
        const next = mock(() => {});
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "secure-fp-123"
        });
        await authMiddleware(c as any, next);
        expect(next).toHaveBeenCalled();
    });
});
