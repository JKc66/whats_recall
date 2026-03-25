import { expect, test, describe } from "bun:test";
import { resolve, relative, sep } from 'path';

function safePath(baseDir, userPath) {
  const decodedPath = decodeURIComponent(userPath);
  const base = resolve(baseDir);
  const normalizedUserPath = decodedPath.replace(/^[\\\/]+/, '');
  const resolved = resolve(base, normalizedUserPath);

  // Ensure the resolved path is actually underneath the base directory
  const relativePath = relative(base, resolved);

  if (relativePath.startsWith('..') || (base !== sep && resolve(relativePath) === relativePath)) {
    return null;
  }

  // Double-check by seeing if the resolved path starts with the base path
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (base !== sep && !resolved.startsWith(baseWithSep) && resolved !== base) {
    return null;
  }

  // If base is root, we allow everything as long as it doesn't try to go above root
  if (base === sep && (decodedPath.includes('..') || decodedPath.startsWith(sep))) {
     // Re-evaluate for root: we should still be careful.
     // If base is root, relativePath will never start with '..'
     // But if userPath was '../../etc/passwd', it resolves to '/etc/passwd'
     // To be safe, if base is root, we only allow paths that don't try to traverse up
     if (normalizedUserPath !== relativePath) return null;
  }

  return resolved;
}

describe("safePath fix verification", () => {
  test("should not allow traversal to sibling directory", () => {
    const baseDir = "/tmp/app/public";
    const userPath = "../public_secrets/file.txt";
    expect(safePath(baseDir, userPath)).toBe(null);
  });

  test("should handle baseDir as root and prevent traversal", () => {
    const baseDir = "/";
    const userPath = "../../etc/passwd";
    expect(safePath(baseDir, userPath)).toBe(null);
  });

  test("should allow valid paths when baseDir is root", () => {
    const baseDir = "/";
    const userPath = "etc/passwd";
    expect(safePath(baseDir, userPath)).toBe("/etc/passwd");
  });

  test("should handle directory prefix bypass", () => {
    const baseDir = "/tmp/app";
    const userPath = "../app_secret/file.txt";
    expect(safePath(baseDir, userPath)).toBe(null);
  });

  test("should allow valid paths within baseDir", () => {
    const baseDir = "/tmp/app";
    const userPath = "public/index.html";
    const result = safePath(baseDir, userPath);
    expect(result).not.toBe(null);
    expect(result).toBe(resolve(baseDir, userPath));
  });

  test("should handle encoded slashes", () => {
    const baseDir = "/tmp/app";
    const userPath = "..%2Fapp_secret%2Ffile.txt";
    expect(safePath(baseDir, userPath)).toBe(null);
  });
});
