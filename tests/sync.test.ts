import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { WhatsAppSync } from "../src/whatsapp/sync.ts";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("WhatsAppSync", () => {
  let tempDir: string;
  let sync: WhatsAppSync;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "whatsapp-sync-test-"));
    process.env.DATA_DIR = tempDir;
    sync = new WhatsAppSync();
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should sync contacts and update mappings", () => {
    const contacts = [
      { id: "pn1@s.whatsapp.net", name: "User 1", lid: "lid1@lid" },
      { id: "lid2@lid", phoneNumber: "pn2" }
    ];

    sync.syncContacts(contacts);

    expect(sync.contacts.has("pn1@s.whatsapp.net")).toBe(true);
    expect(sync.contacts.get("pn1@s.whatsapp.net").name).toBe("User 1");
    
    // Check mappings
    expect(sync.lidToPn.get("lid1@lid")).toBe("pn1@s.whatsapp.net");
    expect(sync.pnToLid.get("pn1@s.whatsapp.net")).toBe("lid1@lid");
    
    expect(sync.lidToPn.get("lid2@lid")).toBe("pn2@s.whatsapp.net");
    expect(sync.pnToLid.get("pn2@s.whatsapp.net")).toBe("lid2@lid");
  });

  test("should sync chats and merge properties", () => {
    const chat1 = { id: "chat1@g.us", name: "Group 1" };
    sync.syncChats([chat1]);
    
    expect(sync.chats.get("chat1@g.us").name).toBe("Group 1");

    const chat1Update = { id: "chat1@g.us", notify: "Notify Name" };
    sync.syncChats([chat1Update]);
    
    const merged = sync.chats.get("chat1@g.us");
    expect(merged.name).toBe("Group 1");
    expect(merged.notify).toBe("Notify Name");
  });

  test("should resolve PN from LID", async () => {
    const lid = "11111@lid";
    const pn = "22222@s.whatsapp.net";
    sync.lidToPn.set(lid, pn);

    const resolved = await sync.resolvePN(lid);
    expect(resolved).toBe(pn);
  });

  test("should resolve LID from PN", async () => {
    const lid = "33333@lid";
    const pn = "44444@s.whatsapp.net";
    sync.pnToLid.set(pn, lid);

    const resolved = await sync.resolveLID(pn);
    expect(resolved).toBe(lid);
  });

  test("should get related JIDs", async () => {
    const lid = "55555@lid";
    const pn = "66666@s.whatsapp.net";
    sync.lidToPn.set(lid, pn);
    sync.pnToLid.set(pn, lid);

    const relatedFromLid = await sync.getRelatedJids(lid);
    expect(relatedFromLid).toContain(lid);
    expect(relatedFromLid).toContain(pn);

    const relatedFromPn = await sync.getRelatedJids(pn);
    expect(relatedFromPn).toContain(lid);
    expect(relatedFromPn).toContain(pn);
  });
});
