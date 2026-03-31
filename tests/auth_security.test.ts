import { expect, test, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";

mock.module("../src/db/database.ts", () => ({
    getDb: () => ({
        getSession: (token: string) => token === "valid-token" ? { fingerprint: "secure-fp-123" } : null,
        cleanExpiredSessions: () => {},
        getStats: () => ({}),
        getSettings: () => ({ whatsapp_notify: "false" }),
        close: () => {}
    }),
    DATA_DIR: "/tmp",
    MEDIA_DIR: "/tmp/media"
}));

import { createHonoServer } from "../src/api/server.ts";
import { authMiddleware } from "../src/api/middleware.ts";

describe("AUTH_PASSWORD Security", () => {
    let originalAuthPassword: string | undefined;
    let exitSpy: any;

    beforeEach(() => {
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

        // Should not throw and not call process.exit
        const server = createHonoServer({} as any);

        expect(exitSpy).not.toHaveBeenCalled();
        expect(server).toBeDefined();
    });
});

describe("Fingerprint Enforcement", () => {
    const createMockContext = (headers: Record<string, string> = {}) => {
        const h = new Headers(headers);
        return {
            req: {
                path: "/api/chats",
                header: (name: string) => h.get(name),
                raw: {
                    headers: h
                }
            },
            json: mock((data: any, status: number) => ({ data, status })),
        };
    };

    test("should reject if session has fingerprint but client provides none", async () => {
        const c = createMockContext({ "X-Auth-Token": "valid-token" });

        await authMiddleware(c as any, async () => {});
        expect(c.json).toHaveBeenCalledWith({ error: "Fingerprint mismatch or missing" }, 401);
    });

    test("should reject if session has fingerprint but client provides wrong one", async () => {
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "wrong-fp"
        });

        await authMiddleware(c as any, async () => {});
        expect(c.json).toHaveBeenCalledWith({ error: "Fingerprint mismatch or missing" }, 401);
    });

    test("should allow if fingerprints match", async () => {
        const next = mock(() => {});
        const c = createMockContext({ 
            "X-Auth-Token": "valid-token",
            "X-Fingerprint": "secure-fp-123"
        });

        await authMiddleware(c as any, next);
        expect(next).toHaveBeenCalled();
    });
});
