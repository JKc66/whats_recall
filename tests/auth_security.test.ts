import { expect, test, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";


import { createHonoServer } from "../src/api/server.ts";

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
