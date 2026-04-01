import { expect, test, describe } from "bun:test";
import { extractJidId, getChatName, safeMerge } from "../src/whatsapp/utils.ts";
import { syncService } from "../src/whatsapp/sync.ts";

describe("WhatsApp Utils", () => {
  describe("extractJidId", () => {
    test("should extract ID from standard JID", () => {
      expect(extractJidId("1234567890@s.whatsapp.net")).toBe("1234567890");
    });

    test("should extract ID from group JID", () => {
      expect(extractJidId("1234567890@g.us")).toBe("1234567890");
    });

    test("should extract ID from LID", () => {
      expect(extractJidId("1234567890@lid")).toBe("1234567890");
    });

    test("should return empty string for null/undefined", () => {
      expect(extractJidId(null)).toBe("");
      expect(extractJidId(undefined)).toBe("");
    });

    test("should return same string if no @ is present", () => {
      expect(extractJidId("1234567890")).toBe("1234567890");
    });
  });

  describe("getChatName", () => {
    test("should return name from syncService contacts if available", () => {
      const jid = "test_jid@s.whatsapp.net";
      syncService.contacts.set(jid, { id: jid, name: "Test Contact" });
      expect(getChatName(jid)).toBe("Test Contact");
      syncService.contacts.delete(jid);
    });

    test("should return name from syncService chats if available", () => {
      const jid = "test_chat@g.us";
      syncService.chats.set(jid, { id: jid, name: "Test Group" });
      expect(getChatName(jid)).toBe("Test Group");
      syncService.chats.delete(jid);
    });

    test("should return pushName if no other name is available", () => {
      const jid = "test_push@s.whatsapp.net";
      expect(getChatName(jid, "Push Name")).toBe("Push Name");
    });

    test("should return extracted ID as fallback", () => {
      const jid = "12345@s.whatsapp.net";
      expect(getChatName(jid)).toBe("12345");
    });

    test("should handle LID to PN resolution via syncService", () => {
      const lid = "user_lid@lid";
      const pn = "user_pn@s.whatsapp.net";
      syncService.lidToPn.set(lid, pn);
      syncService.contacts.set(pn, { id: pn, name: "Resolved Name" });
      
      expect(getChatName(lid)).toBe("Resolved Name");
      
      syncService.lidToPn.delete(lid);
      syncService.contacts.delete(pn);
    });
  });

  describe("safeMerge", () => {
    test("should merge properties correctly", () => {
      const oldObj = { a: 1, b: 2 };
      const newObj = { b: 3, c: 4 };
      expect(safeMerge(oldObj, newObj)).toEqual({ a: 1, b: 3, c: 4 });
    });

    test("should not overwrite with null or undefined", () => {
      const oldObj = { a: 1, b: 2 };
      const newObj = { a: null, b: undefined };
      // Note: Current safeMerge implementation checks val !== undefined && val !== null
      expect(safeMerge(oldObj, newObj)).toEqual({ a: 1, b: 2 });
    });
  });
});
