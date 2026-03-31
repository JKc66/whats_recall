import { expect, test, describe, afterEach, mock, beforeEach } from "bun:test";

describe("Rate Limiting", () => {
    let apiRateLimits: Map<string, any>;
    let checkApiRateLimit: Function;
    let pruneApiRateLimits: Function;
    let originalDateNow: any;

    beforeEach(async () => {
        const utils = await import("../src/api/utils.ts");
        apiRateLimits = utils.apiRateLimits;
        checkApiRateLimit = utils.checkApiRateLimit;
        pruneApiRateLimits = utils.pruneApiRateLimits;

        apiRateLimits.clear();
        originalDateNow = Date.now;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    describe("checkApiRateLimit", () => {
        test("should allow first request and initialize state", () => {
            const mockNow = 10000;
            Date.now = () => mockNow;

            const result = checkApiRateLimit("127.0.0.1", "testPath", 5, 60000);

            expect(result).toBe(true);
            expect(apiRateLimits.get("127.0.0.1:testPath")).toEqual({
                count: 1,
                firstAttempt: mockNow
            });
        });

        test("should allow requests up to the limit", () => {
            const mockNow = 10000;
            Date.now = () => mockNow;

            checkApiRateLimit("127.0.0.1", "testPath", 3, 60000); // 1st
            const result2 = checkApiRateLimit("127.0.0.1", "testPath", 3, 60000); // 2nd

            expect(result2).toBe(true);
            expect(apiRateLimits.get("127.0.0.1:testPath")).toEqual({
                count: 2,
                firstAttempt: mockNow
            });

            const result3 = checkApiRateLimit("127.0.0.1", "testPath", 3, 60000); // 3rd
            expect(result3).toBe(true);
            expect(apiRateLimits.get("127.0.0.1:testPath").count).toBe(3);
        });

        test("should block requests exceeding the limit", () => {
            const mockNow = 10000;
            Date.now = () => mockNow;

            checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // 1st
            checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // 2nd

            const result3 = checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // 3rd

            expect(result3).toBe(false);
            expect(apiRateLimits.get("127.0.0.1:testPath").count).toBe(2);
        });

        test("should reset limit after windowMs has passed", () => {
            let currentNow = 10000;
            Date.now = () => currentNow;

            checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // 1st
            checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // 2nd

            expect(checkApiRateLimit("127.0.0.1", "testPath", 2, 60000)).toBe(false); // 3rd, blocked

            // Move time past windowMs (60000ms)
            currentNow = 10000 + 60001;

            const resultAfterWindow = checkApiRateLimit("127.0.0.1", "testPath", 2, 60000); // Should reset and allow

            expect(resultAfterWindow).toBe(true);
            expect(apiRateLimits.get("127.0.0.1:testPath")).toEqual({
                count: 1,
                firstAttempt: currentNow
            });
        });

        test("should track different paths and IPs independently", () => {
            const mockNow = 10000;
            Date.now = () => mockNow;

            checkApiRateLimit("127.0.0.1", "pathA", 2, 60000);
            checkApiRateLimit("127.0.0.1", "pathA", 2, 60000);

            // Blocked for pathA
            expect(checkApiRateLimit("127.0.0.1", "pathA", 2, 60000)).toBe(false);

            // Allowed for pathB on same IP
            expect(checkApiRateLimit("127.0.0.1", "pathB", 2, 60000)).toBe(true);

            // Allowed for pathA on different IP
            expect(checkApiRateLimit("192.168.1.1", "pathA", 2, 60000)).toBe(true);
        });
    });

    describe("pruneApiRateLimits", () => {
        test("should remove entries older than 600000ms", () => {
            let currentNow = 10000;
            Date.now = () => currentNow;

            apiRateLimits.set("127.0.0.1:pathA", { count: 1, firstAttempt: currentNow });
            apiRateLimits.set("127.0.0.1:pathB", { count: 1, firstAttempt: currentNow + 500000 });

            // Move time so pathA is expired (10000 + 600001) but pathB is not (510000 + 100001 < 510000 + 600000)
            currentNow = 10000 + 600001;

            pruneApiRateLimits();

            expect(apiRateLimits.has("127.0.0.1:pathA")).toBe(false);
            expect(apiRateLimits.has("127.0.0.1:pathB")).toBe(true);
        });

        test("should handle empty apiRateLimits map without errors", () => {
            expect(apiRateLimits.size).toBe(0);
            expect(() => pruneApiRateLimits()).not.toThrow();
            expect(apiRateLimits.size).toBe(0);
        });
    });
});
