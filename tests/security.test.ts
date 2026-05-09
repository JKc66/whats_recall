import { expect, test, describe, afterEach, mock, beforeEach } from "bun:test";

describe("getClientIp", () => {
    let getClientIp: any;
    const originalEnv = process.env.TRUST_PROXY;

    beforeEach(async () => {
        // Reset process.env before import might not work if bun caches, but we'll try
        const module = await import("../src/api/utils.ts");
        getClientIp = module.getClientIp;
    });

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.TRUST_PROXY;
        } else {
            process.env.TRUST_PROXY = originalEnv;
        }
    });

    const mockContext = (headers: Record<string, string> = {}, remoteAddress = "127.0.0.1") => ({
        req: {
            header: (name: string) => headers[name.toLowerCase()],
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

    test("should return the LAST x-forwarded-for when TRUST_PROXY is true and remote is trusted", () => {
        process.env.TRUST_PROXY = "true";
        process.env.TRUSTED_PROXIES = "192.168.1.1";
        const c = mockContext({
            "x-forwarded-for": "1.2.3.4, 5.6.7.8",
            "x-real-ip": "9.10.11.12"
        }, "192.168.1.1");

        expect(getClientIp(c)).toBe("5.6.7.8");
    });

    test("should return x-forwarded-for when it has only one IP and remote is trusted", () => {
        process.env.TRUST_PROXY = "true";
        process.env.TRUSTED_PROXIES = "192.168.1.1";
        const c = mockContext({
            "x-forwarded-for": "1.2.3.4",
        }, "192.168.1.1");

        expect(getClientIp(c)).toBe("1.2.3.4");
    });

    test("should return x-real-ip when TRUST_PROXY is true, remote is trusted, and x-forwarded-for is missing", () => {
        process.env.TRUST_PROXY = "true";
        process.env.TRUSTED_PROXIES = "192.168.1.1";
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

    test("should safely return 127.0.0.1 if an error is thrown when accessing properties", () => {
        process.env.TRUST_PROXY = "false";
        const c = {
            req: {
                header: () => null,
            },
            get env() {
                throw new Error("Malicious or broken getter");
            }
        };

        expect(getClientIp(c)).toBe("127.0.0.1");
    });
});
