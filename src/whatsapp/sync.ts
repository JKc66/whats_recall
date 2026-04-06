import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { log } from '../logger.js';
import { getDataDir } from '../db/database.js';
import { safeMerge, extractJidId } from './utils.ts';

const getCacheFile = () => join(getDataDir(), 'baileys_auth', 'store_cache.json');

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
      if (existsSync(getCacheFile())) {
        const cache = JSON.parse(readFileSync(getCacheFile(), 'utf8'));
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
        const pn = jidNormalizedUser(item.phoneNumber.includes('@s.whatsapp.net') ? item.phoneNumber : (item.phoneNumber + '@s.whatsapp.net'));
        this.lidToPn.set(item.id, pn);
        this.pnToLid.set(pn, item.id);
      } else if (item.id.includes('@s.whatsapp.net') && item.lid) {
        const lid = item.lid.includes('@lid') ? item.lid : (item.lid + '@lid');
        const pn = jidNormalizedUser(item.id);
        this.pnToLid.set(pn, lid);
        this.lidToPn.set(lid, pn);
      }
    }
  }

  private syncItems(newItems: any[], map: Map<string, any>, updateMap = false) {
    if (!newItems?.length) return;
    for (const item of newItems) {
      if (item.id) {
        const old = map.get(item.id) || {};
        map.set(item.id, safeMerge(old, item));
      }
    }
    if (updateMap) this.updateMappings(newItems);
    this.save();
  }

  public syncContacts(newContacts: any[]) {
    this.syncItems(newContacts, this.contacts, true);
  }

  public syncChats(newChats: any[]) {
    this.syncItems(newChats, this.chats);
  }

  public save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      try {
        const data = {
          contacts: Array.from(this.contacts.values()),
          chats: Array.from(this.chats.values())
        };
        await writeFile(getCacheFile(), JSON.stringify(data));
      } catch (e: any) {
        log('SYNC', `Failed to save sync cache: ${e.message}`);
      }
      this.saveTimer = null;
    }, 10000);
  }

  public async resolvePN(jid: string, sock: any = null): Promise<string> {
    if (!jid) return jid;
    if (jid.includes('@g.us')) return jid;
    
    const normalized = jidNormalizedUser(jid);
    if (!jid.includes('@lid')) return normalized;

    // 1. Check local cache
    const cached = this.lidToPn.get(jid);
    if (cached) return jidNormalizedUser(cached);

    // 2. Check Baileys repository
    if (sock?.signalRepository?.lidMapping) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) {
          const fullPn = jidNormalizedUser(pn.includes('@s.whatsapp.net') ? pn : (pn + '@s.whatsapp.net'));
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
      const normalizedCjid = jidNormalizedUser(c_jid);
      if (c_info.lid && (c_info.lid === jid || c_info.lid.includes(extractJidId(jid))) && c_jid.includes('@s.whatsapp.net')) {
        this.lidToPn.set(jid, normalizedCjid);
        this.pnToLid.set(normalizedCjid, jid);
        return normalizedCjid;
      }
    }
    
    return normalized;
  }

  public async resolveLID(jid: string, sock: any = null): Promise<string | null> {
    if (!jid) return null;
    if (!jid.includes('@s.whatsapp.net')) return null;

    const normalizedJid = jidNormalizedUser(jid);
    const cached = this.pnToLid.get(normalizedJid);
    if (cached) return cached;

    if (sock?.signalRepository?.lidMapping) {
      try {
        let lid = await sock.signalRepository.lidMapping.getLIDForPN(normalizedJid);
        if (lid) {
          if (!lid.includes('@lid')) lid += '@lid';
          this.pnToLid.set(normalizedJid, lid);
          this.lidToPn.set(lid, normalizedJid);
          return lid;
        }
      } catch (e: any) {
        log('SYNC', `Failed to get LID for PN ${normalizedJid}: ${e.message}`);
      }
    }

    const contact = this.contacts.get(normalizedJid) || this.contacts.get(jid);
    if (contact?.lid) {
      const lid = contact.lid.includes('@lid') ? contact.lid : (contact.lid + '@lid');
      this.pnToLid.set(normalizedJid, lid);
      this.lidToPn.set(lid, normalizedJid);
      return lid;
    }

    return null;
  }

  public async getRelatedJids(jid: string, sock: any = null): Promise<string[]> {
    const related = new Set<string>([jidNormalizedUser(jid)]);
    
    if (jid.includes('@lid')) {
      const pn = await this.resolvePN(jid, sock);
      if (pn && pn !== jid) related.add(jidNormalizedUser(pn));
    } else if (jid.includes('@s.whatsapp.net')) {
      const lid = await this.resolveLID(jid, sock);
      if (lid) related.add(lid);
    }

    // Also check contacts for any other linked IDs
    for (const [c_jid, c_info] of this.contacts.entries()) {
      const normalizedCjid = jidNormalizedUser(c_jid);
      if (jid.includes('@lid') && c_info.lid && (c_info.lid === jid || c_info.lid.includes(extractJidId(jid)))) {
        related.add(normalizedCjid);
      }
      if (normalizedCjid === jidNormalizedUser(jid) && c_info.phoneNumber) {
        related.add(jidNormalizedUser(c_info.phoneNumber + '@s.whatsapp.net'));
      }
    }

    return Array.from(related);
  }

  /**
   * Aggregates and returns all available chats, merging metadata from contacts,
   * groups, and LID/PN mapping services to provide a unified list.
   */
  public async getAggregatedChats(sock: any): Promise<any[]> {
    if (!sock) return [];

    // 1. Sync groups
    try {
      const allGroups = await sock.groupFetchAllParticipating();
      for (const [id, group] of Object.entries(allGroups)) {
        if (!this.chats.has(id)) {
          this.chats.set(id, { id, name: (group as any).subject });
        }
      }
    } catch (e: any) {
      log('SYNC', `Failed to fetch all participating groups: ${e.message}`);
    }

    // 2. Enrich from contacts
    const blockedDomains = ['@g.us', '@broadcast', '@newsletter'];
    await Promise.all(Array.from(this.contacts.entries()).map(async ([id, contact]) => {
      if (!id || blockedDomains.some(domain => id.endsWith(domain))) return;

      let preferredName = contact.name || contact.verifiedName || contact.notify || contact.pushname || '';

      // Attempt to resolve the Phone Number name for an LID contact if both exist
      if (!preferredName && id.includes('@lid') && contact.phoneNumber) {
        const pnInfo = this.contacts.get(contact.phoneNumber + '@s.whatsapp.net') || this.contacts.get(contact.phoneNumber);
        if (pnInfo) {
          preferredName = pnInfo.name || pnInfo.verifiedName || pnInfo.notify || pnInfo.pushname || '';
        }
      }

      // Resolve LID to Phone Number (PN)
      const targetId = await this.resolvePN(id, sock);

      if (!this.chats.has(targetId)) {
        this.chats.set(targetId, { id: targetId, name: preferredName });
      } else {
        const c = this.chats.get(targetId);
        if (preferredName && (!c.name || c.name === extractJidId(targetId) || c.name.includes(extractJidId(targetId)))) {
          this.chats.set(targetId, { ...c, name: preferredName });
        }
      }
    }));

    // 3. Consolidate (Deduplicate LID and PN)
    const dedupedMap = new Map();
    const chatBlockedDomains = ['@broadcast', '@newsletter'];

    for (const [id, c] of this.chats.entries()) {
      if (!id || chatBlockedDomains.some(domain => id.endsWith(domain))) continue;

      const baseId = await this.resolvePN(id, sock);
      const existing = dedupedMap.get(baseId) || { ...c, id: baseId, lids: [] };

      // Retain meaningful names
      if (c.name && (!existing.name || existing.name === extractJidId(existing.id))) {
        existing.name = c.name;
      }

      // Track lids
      const lidPart = id.includes('@lid') ? extractJidId(id) : null;
      if (lidPart && !existing.lids.includes(lidPart)) {
        existing.lids.push(lidPart);
      }

      // Also check mapped LID for this PN
      if (baseId.includes('@s.whatsapp.net')) {
        const m_lid = this.pnToLid.get(baseId) || null;
        if (m_lid) {
          const m_lidPart = extractJidId(m_lid);
          if (!existing.lids.includes(m_lidPart)) {
            existing.lids.push(m_lidPart);
          }
        }
      }

      // Ensure LID and PN entries for the same contact are permanently merged under the PN
      if (id !== baseId) {
        this.chats.delete(id);
        const currentBaseChat = this.chats.get(baseId);
        if (!currentBaseChat) {
          this.chats.set(baseId, existing);
        } else {
          this.chats.set(baseId, safeMerge(currentBaseChat, existing));
          Object.assign(existing, this.chats.get(baseId));
        }
      }

      // Timestamp merge
      const cTs = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
      const eTs = existing.conversationTimestamp?.low || existing.conversationTimestamp || 0;
      if (cTs > eTs) existing.conversationTimestamp = cTs;

      dedupedMap.set(baseId, existing);
    }

    return Array.from(dedupedMap.values());
  }
}

export const syncService = new WhatsAppSync();
