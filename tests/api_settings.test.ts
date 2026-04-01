process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-api-settings-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { getDb } from "../src/db/database.ts";
import settingsApi from "../src/api/settings.ts";

describe("API /settings", () => {
    let db: any;

    beforeAll(async () => {
        db = getDb();
    });

    beforeEach(async () => {
        await db.clearAllData();
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("GET / should return settings", async () => {
        db.updateSetting("test_key", "test_value");
        
        const res = await settingsApi.request("/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.test_key).toBe("test_value");
    });

    test("POST /update should update a setting", async () => {
        const res = await settingsApi.request("/update", {
            method: "POST",
            body: JSON.stringify({ key: "new_key", value: "new_value" }),
            headers: { "Content-Type": "application/json" }
        });
        
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        
        const settings = db.getSettings();
        expect(settings.new_key).toBe("new_value");
    });
});
