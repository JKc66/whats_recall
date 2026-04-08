import { expect, test, describe, spyOn, afterEach, beforeEach, setSystemTime } from "bun:test";
// Set VERBOSE=true before importing logger to ensure evlog is not silent during tests
process.env.VERBOSE = "true";
import { log } from "../src/logger.ts";

describe("logger", () => {
    let consoleSpy: any;

    beforeEach(() => {
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        if (consoleSpy) consoleSpy.mockRestore();
        setSystemTime();
    });

    function mockSystemDate(isoString: string) {
        setSystemTime(new Date(isoString));
    }


    // Helper to strip ANSI codes for testing the text content
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

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
        // Objects are inspected for compact console output (not passed through raw)
        expect(stripAnsi(String(receivedExtra))).toBe("{ key: 'value' }");
    });

    test("should forward multiple additional arguments to console.log", () => {
        mockSystemDate("2023-10-27T10:20:30");

        log("ERROR", "Something went wrong", "Error details", { code: 500 });

        const call = consoleSpy.mock.calls[0];
        expect(stripAnsi(call[0])).toBe("[10:20:30] [ERROR] Something went wrong");
        expect(call[1]).toBe("Error details");
        expect(stripAnsi(String(call[2]))).toBe("{ code: 500 }");
    });
});
