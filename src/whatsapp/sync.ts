import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { log } from '../logger.js';
import { getDataDir, getDb } from '../db/database.js';
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
          // Cleanup pollution: remove entries from this.chats that have no conversation timestamp and are not groups
          const activeChats = cache.chats.filter((c: any) => 
            c.id.endsWith('@g.us') || 
            (c.conversationTimestamp && (c.conversationTimestamp?.low || c.conversationTimestamp) > 0)
          );
          activeChats.forEach((c: any) => this.chats.set(c.id, c));
          if (activeChats.length < cache.chats.length) {
            log('SYNC', `Cleaned up ${cache.chats.length - activeChats.length} polluted chat entries.`);
            this.save();
          }
        }
        log('SYNC', `Restored ${this.contacts.size} contacts and ${this.chats.size} chats from cache (mappings: ${this.lidToPn.size})`);
      }
    } catch (e: any) {
      log('SYNC', `Failed to restore cache: ${e.message}`);
    }
  }

  public updateMappings(items: any[]) {
    if (!items) return;
    let count = 0;
    for (const item of items) {
      if (!item.id) continue;
      
      // Standard mapping: LID has a linked phoneNumber field
      if (item.id.includes('@lid') && item.phoneNumber) {
        const pn = jidNormalizedUser(item.phoneNumber.includes('@s.whatsapp.net') ? item.phoneNumber : (item.phoneNumber + '@s.whatsapp.net'));
        this.lidToPn.set(item.id, pn);
        this.pnToLid.set(pn, item.id);
        count++;
      } 
      // Reverse mapping: PN has a linked lid field
      else if (item.id.includes('@s.whatsapp.net') && item.lid) {
        const lid = item.lid.includes('@lid') ? item.lid : (item.lid + '@lid');
        const pn = jidNormalizedUser(item.id);
        this.pnToLid.set(pn, lid);
        this.lidToPn.set(lid, pn);
        count++;
      }
    }
    if (count > 0) log('SYNC', `Processed ${count} new LID/PN mappings from contact updates.`);
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
    
    log('SYNC', `Aggregating ${this.contacts.size} contacts and ${this.chats.size} chats...`);

    const blockedDomains = ['@broadcast', '@newsletter'];
    const localMap = new Map<string, any>();

    const getBaseId = (id: string): string | null => {
      if (!id || blockedDomains.some(domain => id.endsWith(domain))) return null;
      if (id.endsWith('@g.us')) return id;
      
      const mapped = this.lidToPn.get(id);
      if (mapped) return extractJidId(mapped);
      return extractJidId(id);
    };

    const isNumeric = (s: string) => /^[0-9+ ]+$/.test(s);
    const isGarbageName = (s: string) => !s || s.trim() === '~' || isNumeric(s);

    // 1. Merge contacts first
    for (const [id, contact] of this.contacts.entries()) {
      if (!id || id.endsWith('@g.us')) continue;
      const baseIdPart = getBaseId(id);
      if (!baseIdPart) continue;

      const jidId = extractJidId(id);
      
      const savedName = (contact.name || '').trim();
      const pushName = (contact.notify || contact.pushname || '').trim();
      const bizName = (contact.verifiedName || '').trim();
      
      // True saved check: user explicitly gave them a name that isn't just their phone number
      const isStrictlySaved = !isGarbageName(savedName);
      
      // Final display name prioritization
      const preferredName = isStrictlySaved ? savedName : (bizName || (!isGarbageName(pushName) ? pushName : ''));

      let existing = localMap.get(baseIdPart);
      if (!existing) {
        existing = {
          id: id.includes('@lid') ? id : baseIdPart + '@s.whatsapp.net',
          name: preferredName,
          isGroup: false,
          isSaved: isStrictlySaved,
          isBusiness: !!bizName,
          timestamp: 0,
          lids: id.includes('@lid') ? [jidId] : []
        };
        localMap.set(baseIdPart, existing);
      } else {
        if (preferredName && isGarbageName(existing.name)) {
          existing.name = preferredName;
        }
        if (isStrictlySaved) existing.isSaved = true;
        if (bizName) existing.isBusiness = true;
        if (id.includes('@lid') && !existing.lids.includes(jidId)) {
          existing.lids.push(jidId);
        }
      }
    }

    // 2. Refresh from active chats
    for (const [id, chat] of this.chats.entries()) {
      const baseIdPart = getBaseId(id);
      if (!baseIdPart) continue;
      
      const existing = localMap.get(baseIdPart);
      const chatTs = (chat.conversationTimestamp?.low || chat.conversationTimestamp || 0);

      // If we didn't see this in contacts, it might be an unsaved chat
      if (!existing) {
        localMap.set(baseIdPart, {
          id,
          name: chat.name || chat.subject || '',
          isGroup: id.endsWith('@g.us'),
          timestamp: chatTs,
          isSaved: false,
          lids: id.includes('@lid') ? [extractJidId(id)] : []
        });
      } else {
        if (chatTs > (existing.timestamp || 0)) {
          existing.timestamp = chatTs;
        }
        // If chat has a better name (subject for groups)
        if (chat.name && (!existing.name || isNumeric(existing.name))) {
          existing.name = chat.name;
        }
      }
    }

    const allResults = Array.from(localMap.values()).map(c => {
      // 3. Classification
      let category: 'contact' | 'chat' | 'group' = 'chat';
      if (c.isGroup) category = 'group';
      else if (c.isSaved) category = 'contact';

      const finalId = (c.id.includes('@')) ? c.id : (c.id + '@s.whatsapp.net');
      return { ...c, id: finalId, category };
    });

    // 4. PRE-DB PURGE: Filter out garbage before saving
    const cleanedResult = allResults.filter(c => {
      // Monitored items ALWAYS stay
      if (sock?.monitored?.has?.(c.id) || sock?.monitored?.has?.(extractJidId(c.id))) return true;
      
      // Groups ALWAYS stay
      if (c.category === 'group') return true;

      const hasHistory = (c.timestamp && c.timestamp > 0);

      // Final Zero-Tolerance Rule: If it's an unnamed LID, it's GONE even with history
      const hasRealName = c.name && !isNumeric(c.name) && c.name.trim() !== '~' && c.name.trim() !== '';
      const isUnnamedLid = c.id.includes('@lid') && !hasRealName;

      const isSaved = c.category === 'contact';
      const isMonitored = sock?.monitored?.has?.(c.id) || sock?.monitored?.has?.(extractJidId(c.id));
      
      // We keep ONLY if:
      // 1. It's not an unnamed LID (Unless already monitored)
      // 2. AND (It's a group, saved contact, monitored, or has history)
      const isUseful = !isUnnamedLid || isMonitored;
      
      // Further filter: if it's a stranger, it MUST have history or be a group
      const strictlyUseful = isUseful && (c.isGroup || isSaved || isMonitored || hasHistory);
      
      return strictlyUseful;
    });

    log('SYNC', `Data Cleaned: Storing ${cleanedResult.length} useful entries in DB (Discarded ${allResults.length - cleanedResult.length} shadows).`);

    try {
      getDb().saveWaContactsBatch(cleanedResult);
    } catch (e: any) {
      log('SYNC', `Failed to save wa_contacts to DB: ${e.message}`);
    }

    return cleanedResult;
  }
}

export const syncService = new WhatsAppSync();
