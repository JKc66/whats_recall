import { expect, test, describe, mock, beforeEach } from "bun:test";
import { getDb } from "../src/db/database.ts";

const mockGetCookie = mock();

// Mock hono/cookie synchronously
mock.module("hono/cookie", () => ({
  getCookie: mockGetCookie,
  setCookie: () => {},
  deleteCookie: () => {}
}));

import { authMiddleware } from "../src/api/middleware.ts";

describe("authMiddleware", () => {
  let mockContext: any;
  let mockNext: any;
  const db = getDb();

  beforeEach(async () => {
    await db.clearAllData();
    mockNext = mock(() => Promise.resolve());
    mockContext = {
      req: {
        path: "/api/chats",
        header: mock((name: string) => undefined)
      },
      json: mock((data: any, status: number) => ({ data, status }))
    };
    mockGetCookie.mockReset();
  });

  test("should allow login and verify paths without token", async () => {
    mockContext.req.path = "/api/auth/login";
    await authMiddleware(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test("should return 401 if no token is found in cookies or headers", async () => {
    mockGetCookie.mockReturnValue(undefined);
    await authMiddleware(mockContext, mockNext);
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
  });

  test("should return 401 if session is not found in database", async () => {
    mockGetCookie.mockReturnValue("non-existent-token");
    await authMiddleware(mockContext, mockNext);
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Session expired or invalid' }, 401);
  });

  test("should return 401 if fingerprint mismatch", async () => {
    const token = "valid-token";
    // Use datetime('now', '+1 hour') to ensure it's not expired in SQLite's view
    db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run(token, "correct-fingerprint");
    
    mockGetCookie.mockReturnValue(token);
    mockContext.req.header.mockImplementation((name: string) => {
      if (name === 'X-Fingerprint') return 'wrong-fingerprint';
      return undefined;
    });

    await authMiddleware(mockContext, mockNext);
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Fingerprint mismatch or missing' }, 401);
  });

  test("should call next() if session is valid and fingerprint matches", async () => {
    const token = "valid-token";
    db.raw.query("INSERT INTO sessions (token, fingerprint, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run(token, "correct-fingerprint");

    mockGetCookie.mockReturnValue(token);
    mockContext.req.header.mockImplementation((name: string) => {
      if (name === 'X-Fingerprint') return 'correct-fingerprint';
      if (name === 'X-Auth-Token') return token;
      return undefined;
    });

    await authMiddleware(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
