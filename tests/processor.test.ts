process.env.NODE_ENV = "test";
import { expect, test, describe, beforeEach, mock, spyOn, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "whatsapp-processor-test-"));
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = join(tempDir, "messages.db");

import { proto } from "@whiskeysockets/baileys";
mock.module("@whiskeysockets/baileys/lib/Utils/crypto.js", () => {
  return {
    aesDecryptGCM: (encPayload: Uint8Array) => {
      if (encPayload && encPayload.length > 0) {
        return proto.Message.encode({
          conversation: "Decrypted from secretEncryptedMessage mock"
        }).finish();
      }
      return new Uint8Array(0);
    },
    hkdf: () => Buffer.alloc(32)
  };
});

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

    test("should handle message edits wrapped in ephemeralMessage", async () => {
        // 1. Save a message first
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, ?)")
              .run("msg-to-edit-ephemeral", "12345@s.whatsapp.net", "Original text", Date.now());

        // 2. Process an ephemeral edit protocol message
        const editEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "edit-id-e" },
            update: {
                message: {
                    ephemeralMessage: {
                        message: {
                            protocolMessage: {
                                type: 14, // MESSAGE_EDIT
                                key: { remoteJid: "12345@s.whatsapp.net", id: "msg-to-edit-ephemeral", fromMe: false },
                                editedMessage: {
                                    ephemeralMessage: {
                                        message: {
                                            conversation: "Edited text ephemeral"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(editEvent);

        const edited = db.getMessage("msg-to-edit-ephemeral");
        expect(edited.body).toBe("Edited text ephemeral");
        
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("msg-to-edit-ephemeral");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("Original text");
        expect(history[0].new_body).toBe("Edited text ephemeral");
    });

    test("should handle message edits received via decrypted editedMessage update", async () => {
        // 1. Save a message first
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, ?)")
              .run("msg-to-edit-decrypted", "12345@s.whatsapp.net", "Original text", Date.now());

        // 2. Process a decrypted editedMessage update
        const editEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "msg-to-edit-decrypted", fromMe: false },
            update: {
                message: {
                    editedMessage: {
                        message: {
                            conversation: "Decrypted edited text"
                        }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(editEvent);

        const edited = db.getMessage("msg-to-edit-decrypted");
        expect(edited.body).toBe("Decrypted edited text");
        
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("msg-to-edit-decrypted");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("Original text");
        expect(history[0].new_body).toBe("Decrypted edited text");
    });

    test("should handle message edits received via decrypted editedMessage update wrapped in ephemeralMessage", async () => {
        // 1. Save a message first
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");
        
        db.raw.query("INSERT INTO messages (message_id, chat_id, body, timestamp) VALUES (?, ?, ?, ?)")
              .run("msg-to-edit-decrypted-ephemeral", "12345@s.whatsapp.net", "Original text", Date.now());

        // 2. Process a decrypted editedMessage update wrapped in ephemeralMessage
        const editEvent = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "msg-to-edit-decrypted-ephemeral", fromMe: false },
            update: {
                message: {
                    ephemeralMessage: {
                        message: {
                            editedMessage: {
                                message: {
                                    conversation: "Decrypted edited text ephemeral"
                                }
                            }
                        }
                    }
                }
            }
        };

        await processor.handleMessageUpdate(editEvent);

        const edited = db.getMessage("msg-to-edit-decrypted-ephemeral");
        expect(edited.body).toBe("Decrypted edited text ephemeral");
        
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("msg-to-edit-decrypted-ephemeral");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("Original text");
        expect(history[0].new_body).toBe("Decrypted edited text ephemeral");
    });

    test("should ignore secretEncryptedMessage in handleMessage", async () => {
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");

        const msg = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "secret-msg-id", fromMe: false },
            message: {
                secretEncryptedMessage: {
                    targetMessageKey: { remoteJid: "12345@s.whatsapp.net", id: "target-id", fromMe: false },
                    encPayload: Buffer.from(""),
                    encIv: Buffer.from(""),
                    secretEncType: 2
                }
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
            pushName: "User 1"
        };

        await processor.handleMessage(msg as any);

        const saved = db.getMessage("secret-msg-id");
        expect(saved).toBeNull();
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

    test("should decrypt secretEncryptedMessage when original message has a secret", async () => {
        db.upsertChat("12345@s.whatsapp.net", "User 1", false);
        db.raw.query("INSERT INTO monitored_chats (chat_id) VALUES (?)").run("12345@s.whatsapp.net");

        // 1. Save original message with a secret
        db.raw.query(`
            INSERT INTO messages (message_id, chat_id, body, timestamp, message_secret)
            VALUES (?, ?, ?, ?, ?)
        `).run("target-msg-id", "12345@s.whatsapp.net", "Original text", Math.floor(Date.now() / 1000), Buffer.from("dummy-secret").toString("base64"));

        // 2. Send secretEncryptedMessage
        const msg = {
            key: { remoteJid: "12345@s.whatsapp.net", id: "edit-secret-msg-id", fromMe: false },
            message: {
                secretEncryptedMessage: {
                    targetMessageKey: { remoteJid: "12345@s.whatsapp.net", id: "target-msg-id", fromMe: false },
                    encPayload: Buffer.from("encrypted-payload-bytes").toString("base64"),
                    encIv: Buffer.from("iv-bytes").toString("base64"),
                    secretEncType: "MESSAGE_EDIT"
                }
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
            pushName: "User 1"
        };

        await processor.handleMessage(msg as any);

        // 3. Verify the original message body is updated to the decrypted content
        const edited = db.getMessage("target-msg-id");
        expect(edited.body).toBe("Decrypted from secretEncryptedMessage mock");

        // 4. Verify that edit history was recorded
        const history = db.raw.query("SELECT * FROM message_edits WHERE message_id = ?").all("target-msg-id");
        expect(history).toHaveLength(1);
        expect(history[0].old_body).toBe("Original text");
        expect(history[0].new_body).toBe("Decrypted from secretEncryptedMessage mock");
    });
});
