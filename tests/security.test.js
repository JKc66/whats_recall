import { expect, test, describe, afterEach, mock, beforeEach } from "bun:test";

describe("getClientIp", () => {
    let getClientIp;
    const originalEnv = process.env.TRUST_PROXY;

    beforeEach(async () => {
        mock.module("hono", () => ({
            Hono: class {
                use() {}
                get() {}
                post() {}
                delete() {}
            }
        }));
        mock.module("hono/cookie", () => ({ getCookie: () => { }, setCookie: () => { }, deleteCookie: () => { } }));
        mock.module("./database.js", () => ({ MEDIA_DIR: "/tmp" }));

        // Reset process.env before import might not work if bun caches, but we'll try
        const module = await import("../src/server.js");
        getClientIp = module.getClientIp;
    });

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.TRUST_PROXY;
        } else {
            process.env.TRUST_PROXY = originalEnv;
        }
    });

    const mockContext = (headers = {}, remoteAddress = "127.0.0.1") => ({
        req: {
            header: (name) => headers[name.toLowerCase()],
            raw: {
                socket: {
                    remoteAddress
                }
            }
        }
    });

    test("should return remoteAddress when TRUST_PROXY is false (default)", () => {
        process.env.TRUST_PROXY = "false";
        const c = mockContext({
            "x-forwarded-for": "1.2.3.4",
            "x-real-ip": "5.6.7.8"
        }, "192.168.1.1");

        expect(getClientIp(c)).toBe("192.168.1.1");
    });

    test("should return x-forwarded-for when TRUST_PROXY is true", () => {
        process.env.TRUST_PROXY = "true";
        const c = mockContext({
            "x-forwarded-for": "1.2.3.4, 5.6.7.8",
            "x-real-ip": "9.10.11.12"
        }, "192.168.1.1");

        expect(getClientIp(c)).toBe("1.2.3.4");
    });

    test("should return x-real-ip when TRUST_PROXY is true and x-forwarded-for is missing", () => {
        process.env.TRUST_PROXY = "true";
        const c = mockContext({
            "x-real-ip": "9.10.11.12"
        }, "192.168.1.1");

        expect(getClientIp(c)).toBe("9.10.11.12");
    });

    test("should fallback to remoteAddress when TRUST_PROXY is true but headers are missing", () => {
        process.env.TRUST_PROXY = "true";
        const c = mockContext({}, "192.168.1.1");

        expect(getClientIp(c)).toBe("192.168.1.1");
    });

    test("should return 127.0.0.1 if everything else fails", () => {
        process.env.TRUST_PROXY = "false";
        const c = { req: { header: () => null } }; // Missing raw.socket

        expect(getClientIp(c)).toBe("127.0.0.1");
    });
});

describe("Login Brute-Force Protection", () => {
    let server;
    let isRateLimited;
    let recordLoginAttempt;
    let resetLoginAttempts;
    let loginAttempts;

    let createServer;

    beforeEach(async () => {
        const module = await import("../src/server.js");
        createServer = module.createServer;

        const mockDb = { getSession: () => null, createSession: () => {}, cleanExpiredSessions: () => {} };
        const mockMonitor = { isReady: () => false };

        server = createServer(mockDb, mockMonitor);
        isRateLimited = server._test.isRateLimited;
        recordLoginAttempt = server._test.recordLoginAttempt;
        resetLoginAttempts = server._test.resetLoginAttempts;
        loginAttempts = server._test.loginAttempts;
    });

    afterEach(() => {
        server.stop();
    });

    test("should not rate limit initially", () => {
        const ip = "1.2.3.4";
        expect(isRateLimited(ip)).toBe(false);
    });

    test("should rate limit after MAX_LOGIN_ATTEMPTS", () => {
        const ip = "1.2.3.4";

        // MAX_LOGIN_ATTEMPTS is 3
        recordLoginAttempt(ip); // 1
        expect(isRateLimited(ip)).toBe(false);

        recordLoginAttempt(ip); // 2
        expect(isRateLimited(ip)).toBe(false);

        recordLoginAttempt(ip); // 3
        expect(isRateLimited(ip)).toBe(true);
    });

    test("should reset rate limit when window expires", () => {
        const ip = "1.2.3.4";
        const originalNow = Date.now;

        try {
            let currentTime = 1000000;
            Date.now = () => currentTime;

            recordLoginAttempt(ip);
            recordLoginAttempt(ip);
            recordLoginAttempt(ip);

            expect(isRateLimited(ip)).toBe(true);

            // Fast forward time past LOGIN_WINDOW_MS (15 mins = 900000 ms)
            currentTime += 900001;

            expect(isRateLimited(ip)).toBe(false);
            expect(loginAttempts.has(ip)).toBe(false);
        } finally {
            Date.now = originalNow;
        }
    });

    test("should not rate limit after resetLoginAttempts is called", () => {
        const ip = "1.2.3.4";

        recordLoginAttempt(ip);
        recordLoginAttempt(ip);
        recordLoginAttempt(ip);

        expect(isRateLimited(ip)).toBe(true);

        resetLoginAttempts(ip);

        expect(isRateLimited(ip)).toBe(false);
    });

    test("should track multiple IPs independently", () => {
        const ip1 = "1.1.1.1";
        const ip2 = "2.2.2.2";

        recordLoginAttempt(ip1);
        recordLoginAttempt(ip1);
        recordLoginAttempt(ip1);

        recordLoginAttempt(ip2);

        expect(isRateLimited(ip1)).toBe(true);
        expect(isRateLimited(ip2)).toBe(false);
    });
});
