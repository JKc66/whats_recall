import { isJidGroup } from '@whiskeysockets/baileys';
import { log } from '../logger.js';
import { MEDIA_DIR } from '../database.js';
import { join } from 'path';
import { writeFile } from 'fs/promises';

export class JidResolver {
  constructor(db, storeManager, monitor) {
    this.db = db;
    this.store = storeManager;
    this.monitor = monitor;
  }

  resolveToPNLocal(jid) {
    if (!jid || !jid.includes('@lid')) return jid;
    return this.store.lidToPn.get(jid) || jid;
  }

  resolveToLIDLocal(jid) {
    if (!jid || !jid.includes('@s.whatsapp.net')) return null;
    return this.store.pnToLid.get(jid) || null;
  }

  async resolveToPN(jid) {
    if (!jid) return jid;
    if (jid.includes('@g.us')) return jid;
    if (jid.includes('@s.whatsapp.net')) return jid;

    if (!jid.includes('@lid')) return jid;

    // 1. Check our fast cache
    const cached = this.store.lidToPn.get(jid);
    if (cached) return cached;

    // 2. Check Baileys' repository - BUT only if we are ready and not in a tight loop potentially
    if (this.monitor.client?.signalRepository?.lidMapping) {
      try {
        const pn = await this.monitor.client.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) {
          const fullPn = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
          this.store.lidToPn.set(jid, fullPn);
          this.store.pnToLid.set(fullPn, jid);
          return fullPn;
        }
      } catch (e) { }
    }

    // 3. Fallback: search contacts for matching LID
    for (const [c_jid, c_info] of this.store.contacts.entries()) {
      if (c_info.lid && (c_info.lid === jid || c_info.lid.includes(jid.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        this.store.lidToPn.set(jid, c_jid);
        this.store.pnToLid.set(c_jid, jid);
        return c_jid;
      }
      if (c_jid === jid && c_info.phoneNumber) {
        const fullPn = c_info.phoneNumber + '@s.whatsapp.net';
        this.store.lidToPn.set(jid, fullPn);
        this.store.pnToLid.set(fullPn, jid);
        return fullPn;
      }
    }
    return jid;
  }

  async resolveToLID(jid) {
    if (!jid || !jid.includes('@s.whatsapp.net')) return null;
    if (this.store.pnToLid.has(jid)) return this.store.pnToLid.get(jid);

    if (this.monitor.client?.signalRepository?.lidMapping) {
      try {
        let lid = await this.monitor.client.signalRepository.lidMapping.getLIDForPN(jid);
        if (lid) {
          if (!lid.includes('@lid')) lid += '@lid';
          this.store.pnToLid.set(jid, lid);
          this.store.lidToPn.set(lid, jid);
          return lid;
        }
      } catch (e) { }
    }

    // Fallback from contacts
    const contact = this.store.contacts.get(jid);
    if (contact?.lid) {
      let lid = contact.lid.includes('@lid') ? contact.lid : (contact.lid + '@lid');
      this.store.pnToLid.set(jid, lid);
      this.store.lidToPn.set(lid, jid);
      return lid;
    }

    return null;
  }

  async getChatName(jid, pushName = null) {
    if (!jid) return 'Unknown';

    let altJid = null;
    if (jid.includes('@lid')) {
      altJid = this.resolveToPNLocal(jid);
      if (altJid === jid) altJid = null;
    } else if (jid.includes('@s.whatsapp.net')) {
      altJid = this.resolveToLIDLocal(jid);
    }

    const contact = this.store.contacts.get(jid) || {};
    const chat = this.store.chats.get(jid) || {};
    const altContact = altJid ? (this.store.contacts.get(altJid) || {}) : {};
    const altChat = altJid ? (this.store.chats.get(altJid) || {}) : {};

    // 1. Phone-saved contact name or verified business name (check both jid and altJid)
    if (contact.name) return contact.name;
    if (altContact.name) return altContact.name;
    if (contact.verifiedName) return contact.verifiedName;
    if (altContact.verifiedName) return altContact.verifiedName;

    // 2. Chat name (group subject or synced name)
    if (chat.name && !chat.name.includes(jid.split('@')[0])) return chat.name;
    if (altJid && altChat.name && !altChat.name.includes(altJid.split('@')[0])) return altChat.name;

    // 3. Push name (real-time or stored)
    if (pushName) return pushName;
    if (contact.notify || contact.pushname) return contact.notify || contact.pushname;
    if (altContact.notify || altContact.pushname) return altContact.notify || altContact.pushname;
    if (chat.notify) return chat.notify;
    if (altChat.notify) return altChat.notify;

    // 4. Dynamic fallback for groups
    if (this.monitor.client && isJidGroup(jid)) {
      try {
        const metadata = await this.monitor.client.groupMetadata(jid);
        if (metadata?.subject) {
          this.store.chats.set(jid, { ...chat, id: jid, name: metadata.subject });
          return metadata.subject;
        }
      } catch (e) { }
    }

    return jid.split('@')[0];
  }

  async checkIsMonitored(jid) {
    if (!jid) return false;
    if (this.db.isMonitored(jid)) return true;

    // If it's a LID, check its PN
    if (jid.includes('@lid')) {
      const pn = await this.resolveToPN(jid);
      if (pn !== jid && this.db.isMonitored(pn)) return true;
    }
    // If it's a PN, check its LID
    else if (jid.includes('@s.whatsapp.net')) {
      const lid = await this.resolveToLID(jid);
      if (lid && this.db.isMonitored(lid)) return true;
    }

    return false;
  }

  async getProfilePic(jid) {
    if (!jid || !this.monitor.client) return null;
    let existing = this.db.getChatProfilePic(jid);
    if (existing) return existing;
    try {
      const url = await this.monitor.client.profilePictureUrl(jid, 'image').catch(() => null);
      if (!url) return null;
      const filename = `dp_${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      const filepath = join(MEDIA_DIR, filename);
      const res = await fetch(url);
      if (!res.ok) return null;
      await writeFile(filepath, Buffer.from(await res.arrayBuffer()));
      this.db.updateChatProfilePic(jid, filename);
      return filename;
    } catch (e) { return null; }
  }
}
