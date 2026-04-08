process.env.NODE_ENV = "test"; // Must be FIRST
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Setup temporary directory for test database
const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-auth-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");
process.env.AUTH_PASSWORD = "test-password-123";

import { getDb, dbInstances } from "../src/db/database.ts";
import authApi from "../src/api/auth.ts";
import { apiRateLimits } from "../src/api/utils.ts";

import { Hono } from 'hono';
import { evlog, type EvlogVariables } from "evlog/hono";
import { parseError } from "evlog";

describe("API /auth", () => {
    let db: any;
    let auth: any;

    beforeAll(async () => {
        
        db = getDb();
        const router = authApi;
        auth = new Hono<EvlogVariables>();
        auth.use('*', evlog());
        
        auth.onError((err: Error, c: any) => {
            const parsed = parseError(err);
            return c.json({ error: parsed.message }, (parsed.status as any) || 500);
        });

        auth.route('/', router);
        // apiRateLimits is already imported directly
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

    test("GET /uptime should return uptime", async () => {
        const res = await auth.request("/uptime");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.uptime).toBeDefined();
        expect(typeof json.uptime).toBe("number");
    });

    test("POST /login should fail with invalid password", async () => {
        const res = await auth.request("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "wrong-password" })
        });
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe("Invalid password");
    });

    test("POST /login should succeed with valid password", async () => {
        const res = await auth.request("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "test-password-123", fingerprint: "fp-123" })
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.token).toBeDefined();

        // Verify session in DB
        const session = db.raw.query("SELECT * FROM sessions WHERE token = ?").get(json.token) as any;
        expect(session).toBeDefined();
        expect(session.fingerprint).toBe("fp-123");
    });

    test("POST /login should rate limit after 5 failed attempts", async () => {
        const testIp = "1.2.3.4";
        for (let i = 0; i < 5; i++) {
            await auth.request("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": testIp },
                body: JSON.stringify({ password: "wrong-password" })
            });
        }
        
        const res = await auth.request("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": testIp },
            body: JSON.stringify({ password: "test-password-123" })
        });
        expect(res.status).toBe(429);
    });

    test("GET /verify should return authenticated for valid session", async () => {
        const token = "test-token-verify";
        const fp = "test-fp-verify";
        db.createSession(token, fp, new Date(Date.now() + 3600000).toISOString());
        
        const res = await auth.request("/verify", {
            headers: {
                "X-Auth-Token": token,
                "X-Fingerprint": fp
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.authenticated).toBe(true);
        expect(json.fingerprint).toBe(fp);
    });

    test("GET /verify should return unauthenticated for invalid session", async () => {
        const res = await auth.request("/verify", {
            headers: { "X-Auth-Token": "invalid" }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.authenticated).toBe(false);
    });

    test("POST /logout should delete session", async () => {
        const token = "test-token-logout";
        db.createSession(token, "fp", new Date(Date.now() + 3600000).toISOString());

        const res = await auth.request("/logout", {
            method: "POST",
            headers: { "X-Auth-Token": token }
        });
        expect(res.status).toBe(200);

        const session = db.raw.query("SELECT * FROM sessions WHERE token = ?").get(token);
        expect(session).toBeNull();
    });
});
