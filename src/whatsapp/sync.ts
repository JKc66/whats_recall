import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { log } from '../logger.js';
import { DATA_DIR } from '../db/database.js';
import { safeMerge } from './utils.ts';

const CACHE_FILE = join(DATA_DIR, 'baileys_auth', 'store_cache.json');

export class WhatsAppSync {
  public contacts = new Map<string, any>();
  public chats = new Map<string, any>();
  public lidToPn = new Map<string, string>();
  public pnToLid = new Map<string, string>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(CACHE_FILE)) {
        const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
        if (cache.contacts) {
          cache.contacts.forEach((c: any) => this.contacts.set(c.id, c));
          this.updateMappings(cache.contacts);
        }
        if (cache.chats) {
          cache.chats.forEach((c: any) => this.chats.set(c.id, c));
        }
        log('SYNC', `Restored ${this.contacts.size} contacts and ${this.chats.size} chats from cache (mappings: ${this.lidToPn.size})`);
      }
    } catch (e: any) {
      log('SYNC', `Failed to restore cache: ${e.message}`);
    }
  }

  public updateMappings(items: any[]) {
    if (!items) return;
    for (const item of items) {
      if (!item.id) continue;
      if (item.id.includes('@lid') && item.phoneNumber) {
        const pn = item.phoneNumber.includes('@s.whatsapp.net') ? item.phoneNumber : (item.phoneNumber + '@s.whatsapp.net');
        this.lidToPn.set(item.id, pn);
        this.pnToLid.set(pn, item.id);
      } else if (item.id.includes('@s.whatsapp.net') && item.lid) {
        const lid = item.lid.includes('@lid') ? item.lid : (item.lid + '@lid');
        this.pnToLid.set(item.id, lid);
        this.lidToPn.set(lid, item.id);
      }
    }
  }

  public syncContacts(newContacts: any[]) {
    if (!newContacts?.length) return;
    for (const contact of newContacts) {
      if (contact.id) {
        const old = this.contacts.get(contact.id) || {};
        this.contacts.set(contact.id, safeMerge(old, contact));
      }
    }
    this.updateMappings(newContacts);
    this.save();
  }

  public syncChats(newChats: any[]) {
    if (!newChats?.length) return;
    for (const chat of newChats) {
      if (chat.id) {
        const old = this.chats.get(chat.id) || {};
        this.chats.set(chat.id, safeMerge(old, chat));
      }
    }
    this.save();
  }

  public save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      try {
        const data = {
          contacts: Array.from(this.contacts.values()),
          chats: Array.from(this.chats.values())
        };
        await writeFile(CACHE_FILE, JSON.stringify(data));
      } catch (e: any) {
        log('SYNC', `Failed to save sync cache: ${e.message}`);
      }
      this.saveTimer = null;
    }, 10000);
  }

  public async resolvePN(jid: string, sock: any = null): Promise<string> {
    if (!jid) return jid;
    if (jid.includes('@g.us')) return jid;
    if (jid.includes('@s.whatsapp.net')) return jid;
    if (!jid.includes('@lid')) return jid;

    // 1. Check local cache
    const cached = this.lidToPn.get(jid);
    if (cached) return cached;

    // 2. Check Baileys repository
    if (sock?.signalRepository?.lidMapping) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) {
          const fullPn = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
          this.lidToPn.set(jid, fullPn);
          this.pnToLid.set(fullPn, jid);
          return fullPn;
        }
      } catch (e: any) {
        log('SYNC', `Failed to get PN for LID ${jid}: ${e.message}`);
      }
    }

    // 3. Fallback: search contacts
    for (const [c_jid, c_info] of this.contacts.entries()) {
      if (c_info.lid && (c_info.lid === jid || c_info.lid.includes(jid.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        this.lidToPn.set(jid, c_jid);
        this.pnToLid.set(c_jid, jid);
        return c_jid;
      }
    }
    
    return jid;
  }

  public async resolveLID(jid: string, sock: any = null): Promise<string | null> {
    if (!jid || !jid.includes('@s.whatsapp.net')) return null;
    const cached = this.pnToLid.get(jid);
    if (cached) return cached;

    if (sock?.signalRepository?.lidMapping) {
      try {
        let lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
        if (lid) {
          if (!lid.includes('@lid')) lid += '@lid';
          this.pnToLid.set(jid, lid);
          this.lidToPn.set(lid, jid);
          return lid;
        }
      } catch (e: any) {
        log('SYNC', `Failed to get LID for PN ${jid}: ${e.message}`);
      }
    }

    const contact = this.contacts.get(jid);
    if (contact?.lid) {
      const lid = contact.lid.includes('@lid') ? contact.lid : (contact.lid + '@lid');
      this.pnToLid.set(jid, lid);
      this.lidToPn.set(lid, jid);
      return lid;
    }

    return null;
  }

  public async getRelatedJids(jid: string, sock: any = null): Promise<string[]> {
    const related = new Set<string>([jid]);
    
    if (jid.includes('@lid')) {
      const pn = await this.resolvePN(jid, sock);
      if (pn && pn !== jid) related.add(pn);
    } else if (jid.includes('@s.whatsapp.net')) {
      const lid = await this.resolveLID(jid, sock);
      if (lid) related.add(lid);
    }

    // Also check contacts for any other linked IDs
    for (const [c_jid, c_info] of this.contacts.entries()) {
      if (jid.includes('@lid') && c_info.lid && (c_info.lid === jid || c_info.lid.includes(jid.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        related.add(c_jid);
      }
      if (c_jid === jid && c_info.phoneNumber) {
        related.add(c_info.phoneNumber + '@s.whatsapp.net');
      }
    }

    return Array.from(related);
  }
}

export const syncService = new WhatsAppSync();
