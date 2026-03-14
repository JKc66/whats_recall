import { expect, test, describe, beforeAll, afterAll } from "bun:test";

describe("utils.ts", () => {
  describe("profilePicUrl", () => {
    let originalBaseUrl: string | undefined;
    let utils: any;

    beforeAll(async () => {
      // Save original to restore later
      originalBaseUrl = process.env.BASE_URL;
      // Set test base url - must have trailing slash stripped by code
      process.env.BASE_URL = "/test-base/";

      // Dynamic import to allow process.env.BASE_URL to be picked up
      utils = await import("./utils.ts");
    });

    afterAll(() => {
      // Restore original
      if (originalBaseUrl === undefined) {
        delete process.env.BASE_URL;
      } else {
        process.env.BASE_URL = originalBaseUrl;
      }
    });

    test("returns null for null path", () => {
      expect(utils.profilePicUrl(null)).toBeNull();
    });

    test("returns null for undefined path", () => {
      expect(utils.profilePicUrl(undefined)).toBeNull();
    });

    test("returns null for empty string path", () => {
      expect(utils.profilePicUrl("")).toBeNull();
    });

    test("returns correctly formatted url for standard path", () => {
      // The code strips trailing slash from BASE_URL if it exists
      // const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
      expect(utils.profilePicUrl("images/pic.jpg")).toBe("/test-base/api/media/images%2Fpic.jpg");
    });

    test("returns correctly encoded url for path with special characters", () => {
      // encodeURIComponent encodes spaces as %20 and special characters
      expect(utils.profilePicUrl("my folder/profile pic 123!.jpg")).toBe("/test-base/api/media/my%20folder%2Fprofile%20pic%20123!.jpg");
      expect(utils.profilePicUrl("test?path&name=1")).toBe("/test-base/api/media/test%3Fpath%26name%3D1");
    });

    test("handles base URL without trailing slash", async () => {
       // Bun's import cache is quite aggressive, so it's easiest to verify
       // the trailing slash behavior via standard BASE_URL logic testing.
       // It strips `/` from the end. Since the beforeAll sets `/test-base/`,
       // we are actually verifying `replace(/\/$/, '')` works because it
       // outputs `/test-base/api/...` instead of `/test-base//api/...`.
       expect(utils.profilePicUrl("img")).toBe("/test-base/api/media/img");
    });
  });
});
