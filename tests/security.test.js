import { expect, test, describe, afterEach, mock, beforeEach } from "bun:test";

describe("getClientIp", () => {
  let getClientIp;
  const originalEnv = process.env.TRUST_PROXY;

  beforeEach(async () => {
    mock.module("hono", () => ({ Hono: class {} }));
    mock.module("hono/cookie", () => ({ getCookie: () => {}, setCookie: () => {}, deleteCookie: () => {} }));
    mock.module("./database.js", () => ({ MEDIA_DIR: "/tmp" }));

    // Dynamically import to pick up mocks
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
