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
        mock.module("./logger.js", () => ({ log: () => {} }));
    });

    afterEach(() => {
        process.env.AUTH_PASSWORD = originalAuthPassword;
        exitSpy.mockRestore();
    });

    test("should exit if AUTH_PASSWORD is not set", async () => {
        delete process.env.AUTH_PASSWORD;

        const { createServer } = await import(`../src/server.js?t=${Date.now()}`);
        expect(() => createServer({}, {})).toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test("should exit if AUTH_PASSWORD is 'changeme'", async () => {
        process.env.AUTH_PASSWORD = "changeme";

        const { createServer } = await import(`../src/server.js?t=${Date.now() + 1}`);
        expect(() => createServer({}, {})).toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
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
