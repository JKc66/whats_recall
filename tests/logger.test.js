import { expect, test, describe, spyOn, afterEach, beforeEach } from "bun:test";
import { log } from "../src/logger.js";

describe("logger", () => {
    let consoleSpy;
    let OriginalDate;

    beforeEach(() => {
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        OriginalDate = global.Date;
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        global.Date = OriginalDate;
    });

    function mockSystemDate(isoString) {
        const fixedDate = new OriginalDate(isoString);
        global.Date = class extends OriginalDate {
            constructor(arg) {
                if (arg) {
                    return new OriginalDate(arg);
                }
                return fixedDate;
            }
            static now() {
                return fixedDate.getTime();
            }
        };
    }

    // Helper to strip ANSI codes for testing the text content
    const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, "");

    test("should log message with correct format and timestamp", () => {
        mockSystemDate("2023-10-27T10:20:30");

        log("TEST", "Hello World");

        const received = stripAnsi(consoleSpy.mock.calls[0][0]);
        expect(received).toBe("[10:20:30] [TEST] Hello World");
    });

    test("should handle single digit month/day/hour/minute/second", () => {
        mockSystemDate("2023-01-02T03:04:05");

        log("DEBUG", "Minimalist");

        const received = stripAnsi(consoleSpy.mock.calls[0][0]);
        expect(received).toBe("[03:04:05] [DEBUG] Minimalist");
    });

    test("should forward additional arguments to console.log", () => {
        mockSystemDate("2023-10-27T10:20:30");

        const extraData = { key: "value" };
        log("INFO", "Message", extraData);

        const receivedMessage = stripAnsi(consoleSpy.mock.calls[0][0]);
        const receivedExtra = consoleSpy.mock.calls[0][1];
        
        expect(receivedMessage).toBe("[10:20:30] [INFO] Message");
        expect(receivedExtra).toEqual(extraData);
    });

    test("should forward multiple additional arguments to console.log", () => {
        mockSystemDate("2023-10-27T10:20:30");

        log("ERROR", "Something went wrong", "Error details", { code: 500 });

        const call = consoleSpy.mock.calls[0];
        expect(stripAnsi(call[0])).toBe("[10:20:30] [ERROR] Something went wrong");
        expect(call[1]).toBe("Error details");
        expect(call[2]).toEqual({ code: 500 });
    });
});
