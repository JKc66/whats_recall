process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, afterEach, beforeAll, afterAll, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-media-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");
process.env.MEDIA_DIR = join(tempDir, "media");

// Mocking Baileys
mock.module("@whiskeysockets/baileys", () => ({
    downloadMediaMessage: async () => Buffer.from("fake media content"),
}));

// Mocking fetch for profile pic
// Use any to avoid missing fetch properties like 'preconnect' in Bun types
(global as any).fetch = async (url: string) => ({
    ok: true,
    arrayBuffer: async () => Buffer.from("fake profile pic").buffer
});

import { getDb } from "../src/db/database.ts";
import { downloadMedia, downloadProfilePic } from "../src/whatsapp/media.ts";

describe("Media Utils", () => {
    let db: any;

    beforeAll(async () => {
        db = getDb(process.env.DB_PATH, process.env.MEDIA_DIR);
        if (!existsSync(process.env.MEDIA_DIR!)) {
            mkdirSync(process.env.MEDIA_DIR!, { recursive: true });
        }
    });

    beforeEach(async () => {
        await db.clearAllData();
        // Ensure media dir exists after clearAllData
        if (!existsSync(process.env.MEDIA_DIR!)) {
            mkdirSync(process.env.MEDIA_DIR!, { recursive: true });
        }
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("downloadProfilePic should download and save profile picture in profile/", async () => {
        const sock = {
            profilePictureUrl: async () => "https://example.com/pic.jpg"
        };
        
        db.upsertChat("user1@s.whatsapp.net", "User 1", false);
        const result = await downloadProfilePic("user1@s.whatsapp.net", sock);
        expect(result).not.toBeNull();
        expect(result?.isNew).toBe(true);
        expect(result?.filename).toMatch(/^profile\/dp_[a-f0-9]{16}\.jpg$/);
        expect(existsSync(join(process.env.MEDIA_DIR!, result?.filename!))).toBe(true);
        
        const dbPic = db.getChatProfilePic("user1@s.whatsapp.net");
        expect(dbPic).toBe(result?.filename);
    });

    test("downloadProfilePic should reuse existing profile picture from disk", async () => {
        const sock = {
            profilePictureUrl: async () => "https://example.com/pic.jpg"
        };
        
        const result1 = await downloadProfilePic("user2@s.whatsapp.net", sock);
        const result2 = await downloadProfilePic("user3@s.whatsapp.net", sock);

        expect(result1?.filename).toBe(result2?.filename);
        expect(result2?.isNew).toBe(false);
    });

    test("downloadMedia should download and save media in images/", async () => {
        const message = {
            message: {
                imageMessage: {
                    fileSha256: Buffer.from("fake-sha256")
                }
            }
        };
        
        const result = await downloadMedia(message as any, "image");
        expect(result).not.toBeNull();
        expect(result?.sha256hex).toBe(Buffer.from("fake-sha256").toString('hex'));
        expect(result?.path).toStartWith("images/");
        expect(existsSync(join(process.env.MEDIA_DIR!, result?.path!))).toBe(true);
    });

    test("downloadMedia should handle viewOnceMessage and put in videos/", async () => {
        const message = {
            message: {
                viewOnceMessage: {
                    message: {
                        videoMessage: {
                            fileSha256: Buffer.from("video-sha256")
                        }
                    }
                }
            }
        };
        
        const result = await downloadMedia(message as any, "video");
        expect(result).not.toBeNull();
        expect(result?.sha256hex).toBe(Buffer.from("video-sha256").toString('hex'));
        expect(result?.path).toStartWith("videos/");
    });

    test("downloadMedia should return null if no media found", async () => {
        const message = { message: { conversation: "hello" } };
        const result = await downloadMedia(message as any, "image");
        expect(result).toBeNull();
    });
});
