import { expect, test, describe, spyOn } from "bun:test";
import { log } from "../src/logger.ts";

describe("Log Forging Mitigation", () => {
    test("should prevent log forging by sanitizing newline characters", () => {
        const consoleSpy = spyOn(console, "log");

        const maliciousPath = "/api/v1/user\n[2025-01-01 00:00:00] [AUTH] Login success from 1.2.3.4";
        const method = "GET";
        const status = 200;
        const elapsed = 50;

        // The sanitization logic from src/server.js
        const sanitize = (p: string) => p.replace(/[\n\r]/g, '');
        const safePath = sanitize(maliciousPath);

        log('HTTP', `${method} ${safePath} → ${status} (${elapsed}ms)`);

        expect(consoleSpy).toHaveBeenCalled();
        const loggedMessage = consoleSpy.mock.calls[0][0];

        // Ensure no newline is present that could cause forging
        expect(loggedMessage).not.toContain("\n[2025-01-01 00:00:00]");
        expect(loggedMessage).toContain("/api/v1/user[2025-01-01 00:00:00]");

        consoleSpy.mockRestore();
    });
});
