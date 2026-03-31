import { expect, test, describe, mock, beforeEach } from "bun:test";

describe("safePath", () => {
    let safePath: any;
    let resolve: any, join: any;

    beforeEach(async () => {
        const server = await import("../src/api/utils.ts");
        safePath = server.safePath;
        const path = await import("path");
        resolve = path.resolve;
        join = path.join;
    });

    test("should allow valid paths within baseDir", () => {
        const baseDir = resolve("public");
        const userPath = "index.html";
        const expected = join(baseDir, "index.html");
        expect(safePath(baseDir, userPath)).toBe(expected);
    });

    test("should allow valid paths in subdirectories", () => {
        const baseDir = resolve("public");
        const userPath = "css/style.css";
        const expected = join(baseDir, "css/style.css");
        expect(safePath(baseDir, userPath)).toBe(expected);
    });

    test("should block directory traversal attempts with ../", () => {
        const baseDir = resolve("public");
        const userPath = "../../etc/passwd";
        expect(safePath(baseDir, userPath)).toBeNull();
    });

    test("should block directory traversal attempts with multiple ../", () => {
        const baseDir = resolve("public");
        const userPath = "sub/../../../etc/passwd";
        expect(safePath(baseDir, userPath)).toBeNull();
    });

    test("should block URL-encoded directory traversal attempts", () => {
        const baseDir = resolve("public");
        const userPath = "%2e%2e%2f%2e%2e%2fetc%2fpasswd";
        expect(safePath(baseDir, userPath)).toBeNull();
    });

    test("should handle double URL-encoded directory traversal (if decoded once)", () => {
        const baseDir = resolve("public");
        const userPath = "%252e%252e%252fetc%252fpasswd";
        const result = safePath(baseDir, userPath);
        if (result !== null) {
            expect(result.startsWith(baseDir)).toBe(true);
        }
    });

    test("should block absolute paths by normalizing them into baseDir", () => {
        const baseDir = resolve("public");
        const userPath = "/etc/passwd";
        const expected = join(baseDir, "etc/passwd");
        expect(safePath(baseDir, userPath)).toBe(expected);
    });

    test("should block prefix bypass attempts", () => {
        const base = resolve("/tmp/base");
        const userPath = "../base_secret/file.txt";
        expect(safePath(base, userPath)).toBeNull();
    });

    test("should handle empty or dot paths (returns null currently)", () => {
        const baseDir = resolve("public");
        // Due to the implementation: startsWith(base + '/')
        // /app/public does not start with /app/public/
        expect(safePath(baseDir, "")).toBeNull();
        expect(safePath(baseDir, ".")).toBeNull();
    });

    test("should handle multiple leading slashes", () => {
        const baseDir = resolve("public");
        const userPath = "////index.html";
        const expected = join(baseDir, "index.html");
        expect(safePath(baseDir, userPath)).toBe(expected);
    });

    test("should handle paths with null bytes", () => {
        const baseDir = resolve("public");
        const userPath = "index.html\0.php";
        // Node's path.resolve throws on null bytes in some environments or versions.
        // If it doesn't throw, we ensure the result is either null or a safe path within baseDir.
        let result;
        try {
            result = safePath(baseDir, userPath);
        } catch (e) {
            // If it throws, it effectively blocks the invalid path.
            return;
        }

        if (result !== null) {
            expect(result).not.toContain("\0");
            expect(result.startsWith(baseDir)).toBe(true);
        }
    });
});
