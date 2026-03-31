import { expect, test, describe, mock, beforeEach } from "bun:test";

const mockGetSession = mock();
const mockGetCookie = mock();

// Mocking dependencies BEFORE any imports
mock.module("../src/db/database.ts", () => ({
  getDb: () => ({
    getSession: mockGetSession
  })
}));

mock.module("hono/cookie", () => ({
  getCookie: mockGetCookie
}));

// We need to mock 'hono' because it's imported in middleware.ts
mock.module("hono", () => ({
  Context: {} as any,
  Next: {} as any
}));

import { authMiddleware } from "../src/api/middleware.ts";

describe("authMiddleware", () => {
  let mockContext: any;
  let mockNext: any;

  beforeEach(() => {
    mockNext = mock(() => Promise.resolve());
    mockContext = {
      req: {
        path: "/api/chats",
        header: mock((name) => {
           return undefined;
        })
      },
      json: mock((data, status) => ({ data, status }))
    };
    mockGetCookie.mockReset();
    mockGetSession.mockReset();
    (mockContext.req.header as any).mockReset();
  });

  test("should allow login and verify paths without token", async () => {
    mockContext.req.path = "/api/auth/login";
    await authMiddleware(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();

    mockNext.mockClear();
    mockContext.req.path = "/api/auth/verify";
    await authMiddleware(mockContext, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test("should return 401 if no token is found in cookies or headers", async () => {
    mockGetCookie.mockReturnValue(undefined);
    mockContext.req.header.mockReturnValue(undefined);

    await authMiddleware(mockContext, mockNext);

    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("should return 401 if session is not found in database", async () => {
    mockGetCookie.mockReturnValue("valid-token");
    mockGetSession.mockReturnValue(null);

    await authMiddleware(mockContext, mockNext);

    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Session expired or invalid' }, 401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("should return 401 if fingerprint mismatch", async () => {
    mockGetCookie.mockReturnValue("valid-token");
    mockContext.req.header.mockImplementation((name: string) => {
      if (name === 'X-Fingerprint') return 'wrong-fingerprint';
      return undefined;
    });
    mockGetSession.mockReturnValue({ token: 'valid-token', fingerprint: 'correct-fingerprint' });

    await authMiddleware(mockContext, mockNext);

    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Session expired or invalid' }, 401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("should call next() if session is valid and fingerprint matches", async () => {
    mockGetCookie.mockReturnValue("valid-token");
    mockGetSession.mockReturnValue({ token: 'valid-token', fingerprint: 'correct-fingerprint' });
    mockContext.req.header.mockImplementation((name: string) => {
      if (name === 'X-Fingerprint') return 'correct-fingerprint';
      if (name === 'X-Auth-Token') return 'valid-token';
      return undefined;
    });

    await authMiddleware(mockContext, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test("should call next() if session is valid and no fingerprint is provided", async () => {
    mockGetCookie.mockReturnValue("valid-token");
    mockGetSession.mockReturnValue({ token: 'valid-token' }); // session has no fingerprint
    mockContext.req.header.mockImplementation((name: string) => {
        if (name === 'X-Auth-Token') return 'valid-token';
        return undefined;
    });

    await authMiddleware(mockContext, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test("should accept token from X-Auth-Token header if cookie is missing", async () => {
    mockGetCookie.mockReturnValue(undefined);
    mockContext.req.header.mockImplementation((name: string) => {
      if (name === 'X-Auth-Token') return 'header-token';
      return undefined;
    });
    mockGetSession.mockReturnValue({ token: 'header-token' });

    await authMiddleware(mockContext, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
