import { expect, test, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";

describe("AUTH_PASSWORD Security", () => {
    let originalAuthPassword;
    let exitSpy;

    beforeEach(() => {
        originalAuthPassword = process.env.AUTH_PASSWORD;
        exitSpy = spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit called");
        });

        // Mock all dependencies needed for importing server.js
        mock.module("hono", () => ({
            Hono: class {
                use() { return this; }
                post() { return this; }
                get() { return this; }
                delete() { return this; }
            }
        }));
        mock.module("hono/cookie", () => ({ getCookie: () => {}, setCookie: () => {}, deleteCookie: () => {} }));
        mock.module("./database.js", () => ({ MEDIA_DIR: "/tmp" }));
    });

    afterEach(() => {
        process.env.AUTH_PASSWORD = originalAuthPassword;
        exitSpy.mockRestore();
    });

    test("should generate temporary password if AUTH_PASSWORD is not set", async () => {
        delete process.env.AUTH_PASSWORD;

        let loggedPassword = null;
        const loggerModule = await import("../src/logger.js");
        const logSpy = spyOn(loggerModule, "log").mockImplementation((category, message) => {
            if (message && message.match) {
                const match = message.match(/Generated temporary password: ([0-9a-f]{32})/);
                if (match) loggedPassword = match[1];
            }
        });

        const { createServer } = await import(`../src/server.js?t=${Date.now()}`);
        const server = createServer({
            cleanExpiredSessions: () => {},
            getSettings: () => ({})
        }, {
            getNotifyEnabled: () => false
        });

        expect(exitSpy).not.toHaveBeenCalled();
        expect(server).toBeDefined();
        expect(loggedPassword).not.toBeNull();
        expect(loggedPassword).toMatch(/^[0-9a-f]{32}$/);
        logSpy.mockRestore();
    });

    test("should generate temporary password if AUTH_PASSWORD is 'changeme'", async () => {
        process.env.AUTH_PASSWORD = "changeme";

        let loggedPassword = null;
        const loggerModule = await import("../src/logger.js");
        const logSpy = spyOn(loggerModule, "log").mockImplementation((category, message) => {
            if (message && message.match) {
                const match = message.match(/Generated temporary password: ([0-9a-f]{32})/);
                if (match) loggedPassword = match[1];
            }
        });

        const { createServer } = await import(`../src/server.js?t=${Date.now() + 1}`);
        const server = createServer({
            cleanExpiredSessions: () => {},
            getSettings: () => ({})
        }, {
            getNotifyEnabled: () => false
        });

        expect(exitSpy).not.toHaveBeenCalled();
        expect(server).toBeDefined();
        expect(loggedPassword).not.toBeNull();
        expect(loggedPassword).toMatch(/^[0-9a-f]{32}$/);
        logSpy.mockRestore();
    });

    test("should NOT exit if AUTH_PASSWORD is set to a secure value", async () => {
        process.env.AUTH_PASSWORD = "a-secure-password-123";

        const { createServer } = await import(`../src/server.js?t=${Date.now() + 2}`);
        // Should not throw and not call process.exit
        const server = createServer({
            cleanExpiredSessions: () => {},
            getSettings: () => ({})
        }, {
            getNotifyEnabled: () => false
        });

        expect(exitSpy).not.toHaveBeenCalled();
        expect(server).toBeDefined();
    });
});
