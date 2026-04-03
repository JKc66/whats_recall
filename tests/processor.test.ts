process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, mock, spyOn, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-processor-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

const { getDb, dbInstances } = await import("../src/db/database.ts");

describe("MessageProcessor", () => {
    let db: any;
    let mockSock: any;
    let mockBroadcast: any;
    let processor: any;
    let syncService: any;
    let MessageProcessor: any;

    beforeAll(async () => {
        
        db = getDb();
        const syncMod = await import("../src/whatsapp/sync.ts");
        syncService = syncMod.syncService;
        const procMod = await import("../src/whatsapp/processor.ts");
        MessageProcessor = procMod.MessageProcessor;
    });

    beforeEach(async () => {
        await db.clearAllData();
        mockSock = {
            user: { id: "me@s.whatsapp.net" },
            ev: { on: mock(() => {}) },
            sendMessage: mock(async () => ({}))
        };
        mockBroadcast = mock(() => {});
        processor = new MessageProcessor(mockSock, mockBroadcast);
        
        // Mock syncService.getRelatedJids
        spyOn(syncService, 'getRelatedJids').mockImplementation(async (jid: string) => [jid]);
        spyOn(syncService, 'resolvePN').mockImplementation(async (jid: string) => jid);
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("should process and save a new text message", async () => {
        // Mark as monitored so it gets saved
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");

        const msg = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "msg1", fromMe: false },
            message: { conversation: "Hello" },
            messageTimestamp: Math.floor(Date.now() / 1000),
            pushName: "User 1"
        };

        await processor.handleMessage(msg as any);

        const saved = db.getMessage("msg1");
        expect(saved).toBeDefined();
        expect(saved.body).toBe("Hello");
        expect(saved.chat_id).toBe("12345@s.whatsapp.net");
    });

    test("should handle message deletion (revoke)", async () => {
        // 1. Save a message first
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, ?)")
              .run("msg-to-delete", "12345@s.whatsapp.net", "Delete me", Date.now());

        // 2. Process a revoke protocol message
        const revokeEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "revoke-id" },
            update: {
                message: {
                    protocolMessage: {
                        type: 0, // REVOKE
                        key: { remoteJid: "12345@s.whatsapp.net", id: "msg-to-delete", fromMe: false }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(revokeEvent);

        const deleted = db.getMessage("msg-to-delete");
        expect(deleted.is_deleted).toBe(1);
        expect(mockBroadcast).toHaveBeenCalledWith("message_deleted", expect.any(Object));
    });

    test("should handle message edits", async () => {
        // 1. Save a message first
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, ?)")
              .run("msg-to-edit", "12345@s.whatsapp.net", "Original text", Date.now());

        // 2. Process an edit protocol message
        const editEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "edit-id" },
            update: {
                message: {
                    protocolMessage: {
                        type: 14, // MESSAGE_EDIT
                        key: { remoteJid: "12345@s.whatsapp.net", id: "msg-to-edit", fromMe: false },
                        editedMessage: { conversation: "Edited text" }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(editEvent);

        const edited = db.getMessage("msg-to-edit");
        expect(edited.body).toBe("Edited text");
        
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("msg-to-edit");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("Original text");
        expect(history[0].new_body).toBe("Edited text");
    });

    test("should handle message edits for non-existent messages (out-of-order)", async () => {
        // 1. Mark as monitored
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        // 2. Process an edit protocol message for a message NOT in DB
        const editEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "edit-id" },
            update: {
                message: {
                    protocolMessage: {
                        type: 14, // MESSAGE_EDIT
                        key: { remoteJid: "12345@s.whatsapp.net", id: "msg-out-of-order", fromMe: false },
                        editedMessage: { conversation: "First Edit" }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(editEvent);

        // 3. Verify message was created as a stub
        const stub = db.getMessage("msg-out-of-order");
        expect(stub).toBeDefined();
        expect(stub.body).toBe("First Edit");
        
        // 4. Subsequent edit should record history
        const secondEditEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "edit-id-2" },
            update: {
                message: {
                    protocolMessage: {
                        type: 14, // MESSAGE_EDIT
                        key: { remoteJid: "12345@s.whatsapp.net", id: "msg-out-of-order", fromMe: false },
                        editedMessage: { conversation: "Second Edit" }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(secondEditEvent);

        const edited = db.getMessage("msg-out-of-order");
        expect(edited.body).toBe("Second Edit");
        
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("msg-out-of-order");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("First Edit");
        expect(history[0].new_body).toBe("Second Edit");
    });
});
