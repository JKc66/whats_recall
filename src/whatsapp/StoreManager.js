import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { log } from '../logger.js';

export function safeMerge(oldObj, newObj) {
  const merged = { ...oldObj };
  for (const key in newObj) {
    if (newObj[key] !== undefined && newObj[key] !== null) {
      merged[key] = newObj[key];
    }
  }
  return merged;
}

export class StoreManager {
  constructor(BAILEYS_DATA_DIR) {
    this.BAILEYS_DATA_DIR = BAILEYS_DATA_DIR;
    this.CACHE_FILE = join(BAILEYS_DATA_DIR, 'store_cache.json');
    this.contacts = new Map();
    this.chats = new Map();
    this.lidToPn = new Map();
    this.pnToLid = new Map();
    this.saveTimer = null;

    if (!existsSync(this.BAILEYS_DATA_DIR)) {
      mkdirSync(this.BAILEYS_DATA_DIR, { recursive: true });
    }
  }

  updateMappings(items) {
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

  loadCache() {
    try {
      if (existsSync(this.CACHE_FILE)) {
        const cache = JSON.parse(readFileSync(this.CACHE_FILE, 'utf8'));
        if (cache.contacts) {
          cache.contacts.forEach(c => this.contacts.set(c.id, c));
          this.updateMappings(cache.contacts);
        }
        if (cache.chats) {
          cache.chats.forEach(c => this.chats.set(c.id, c));
        }
        log('WA', `Restored ${this.contacts.size} contacts and ${this.chats.size} chats from cache (mappings: ${this.lidToPn.size})`);
      }
    } catch (e) {
      log('WA', 'Failed to restore store cache: ' + e.message);
    }
  }

  saveCache() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      try {
        const data = {
          contacts: Array.from(this.contacts.values()),
          chats: Array.from(this.chats.values())
        };
        await writeFile(this.CACHE_FILE, JSON.stringify(data));
      } catch (e) {
        log('WA', 'Failed to save store cache: ' + e.message);
      }
      this.saveTimer = null;
    }, 10000);
  }

  clear() {
    this.contacts.clear();
    this.chats.clear();
    this.lidToPn.clear();
    this.pnToLid.clear();
  }

  upsertContacts(newContacts) {
    for (const contact of newContacts) {
      if (contact.id) {
        const old = this.contacts.get(contact.id) || {};
        this.contacts.set(contact.id, safeMerge(old, contact));
      }
    }
    this.updateMappings(newContacts);
    this.saveCache();
  }

  upsertChats(newChats) {
    for (const chat of newChats) {
      if (chat.id) {
        const old = this.chats.get(chat.id) || {};
        this.chats.set(chat.id, safeMerge(old, chat));
      }
    }
    this.saveCache();
  }
}
