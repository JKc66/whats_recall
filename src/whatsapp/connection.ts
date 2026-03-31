import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  isJidGroup,
  WAMessage
} from '@whiskeysockets/baileys';
import { existsSync, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import pino from 'pino';
import { log } from '../logger.js';
import { getDb, DATA_DIR, MEDIA_DIR } from '../db/database.js';
import { syncService } from './sync.ts';
import { MessageProcessor } from './processor.ts';
import { getChatName, safeMerge } from './utils.ts';
import { BroadcastFn, PairingStatus } from '../types.ts';

const db = getDb();
const AUTH_DIR = join(DATA_DIR, 'baileys_auth');

export class WhatsAppConnection {
  private sock: any = null;
  public isReady = false;
  public isAuthenticated = false;
  private pairingData: PairingStatus = { type: null, data: null, connected: false, authenticated: false };
  private reconnectAttempts = 0;
  private isInitializing = false;
  public myId: string | null = null;
  private processor: MessageProcessor | null = null;
  private lastPairingCodeRequest = 0;
  private pairingRequested = false;
  private notifyWhatsApp = false;

  constructor(private broadcast: BroadcastFn) {
    if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

    // Continuously poll the 'whatsapp_notify' setting from the database to stay in sync
    const s = db.getSettings();
    this.notifyWhatsApp = s.whatsapp_notify === 'true';
    setInterval(() => {
      const s = db.getSettings();
      this.notifyWhatsApp = s.whatsapp_notify === 'true';
    }, 10000);
  }

  public async start() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (this.sock) {
        log('CONN', 'Closing existing socket...');
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.end();
        this.sock = null;
      }

      log('CONN', 'Initializing Baileys Socket...');
      const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      
      let version: [number, number, number];
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version as [number, number, number];
      } catch {
        version = [2, 3000, 1015901307];
      }

      const s = db.getSettings();
      const isRegistered = authState?.creds?.registered;
      const printQR = !isRegistered && s.whatsapp_pairing_method === 'qr' && this.pairingRequested;

      this.sock = makeWASocket({
        auth: authState,
        version,
        printQRInTerminal: printQR,
        logger: pino({ level: 'silent' }) as any,
        syncFullHistory: true,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '20.0.0']
      });

      this.processor = new MessageProcessor(this.sock, this.broadcast);
      this.sock.ev.on('creds.update', saveCreds);

      // If the session is not yet registered and no pairing has been requested, we stay idle
      if (!isRegistered && !this.pairingRequested) {
        log('CONN', 'Auth not registered. Waiting for explicit pairing request from UI.');
        if (this.sock && this.sock.ev) {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.end();
          this.sock = null;
        }
      } else if (s.whatsapp_phone && (s.whatsapp_pairing_method === 'code' || !s.whatsapp_pairing_method) && !authState.creds.registered) {
        // Initiate pairing via phone number if configured method is 'code'
        const now = Date.now();
        if (now - this.lastPairingCodeRequest > 60000) {
          setTimeout(async () => {
            try {
              if (!this.sock || this.sock.authState.creds.registered) return;
              const formattedPhone = s.whatsapp_phone!.replace(/[^0-9]/g, '');
              const code = await this.sock.requestPairingCode(formattedPhone);
              this.lastPairingCodeRequest = Date.now();
              const readableCode = code?.match(/.{1,4}/g)?.join('-') || code;
              this.pairingData = { type: 'code', data: readableCode, connected: false, authenticated: false };
              log('CONN', `📱 Pairing code generated: ${readableCode}`);
              this.broadcast('status', this.pairingData);
            } catch (err: any) {
              log('CONN', `Failed to request pairing code: ${err.message}`);
            }
          }, 3000);
        } else {
          log('CONN', 'Using existing pairing code (cooldown active)');
        }
      }
    } finally {
      this.isInitializing = false;
    }

    if (!this.sock) return; // Aborted initialization

    // --- Baileys Event Handlers (History Sync, Contacts, Groups, etc.) ---

    this.sock.ev.on('messaging-history.set', ({ chats, contacts, isLatest }: any) => {
      if (chats?.length || contacts?.length) {
        log('CONN', `History sync: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts (isLatest: ${isLatest})`);
      }
      for (const contact of (contacts || [])) {
        if (contact.id) {
          const old = syncService.contacts.get(contact.id) || {};
          syncService.contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      syncService.updateMappings(contacts || []);
      for (const chat of (chats || [])) {
        if (chat.id) {
          const old = syncService.chats.get(chat.id) || {};
          syncService.chats.set(chat.id, safeMerge(old, chat));
        }
      }
      syncService.save();
    });

    this.sock.ev.on('contacts.upsert', (newContacts: any[]) => {
      log('CONN', `Contacts upsert: ${newContacts.length} contacts`);
      for (const contact of newContacts) {
        if (contact.id) {
          const old = syncService.contacts.get(contact.id) || {};
          syncService.contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      syncService.updateMappings(newContacts);
      syncService.save();
    });

    this.sock.ev.on('contacts.set', ({ contacts }: any) => {
      if (!contacts) return;
      log('CONN', `Contacts set: ${contacts.length} contacts`);
      for (const contact of contacts) {
        if (contact.id) {
          const old = syncService.contacts.get(contact.id) || {};
          syncService.contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      syncService.updateMappings(contacts);
      syncService.save();
    });

    this.sock.ev.on('chats.set', ({ chats }: any) => {
      if (!chats) return;
      log('CONN', `Chats set: ${chats.length} chats`);
      for (const chat of chats) {
        if (chat.id) {
          const old = syncService.chats.get(chat.id) || {};
          syncService.chats.set(chat.id, safeMerge(old, chat));
        }
      }
      syncService.save();
    });

    this.sock.ev.on('groups.upsert', (newGroups: any[]) => {
      for (const group of newGroups) {
        if (group.id) {
          const existing = syncService.chats.get(group.id) || {};
          syncService.chats.set(group.id, safeMerge(existing, { id: group.id, name: group.subject }));
        }
      }
      syncService.save();
    });

    this.sock.ev.on('groups.update', (updates: any[]) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          const existing = syncService.chats.get(update.id) || {};
          syncService.chats.set(update.id, { ...existing, id: update.id, name: update.subject });
        }
      }
      syncService.save();
    });

    this.sock.ev.on('contacts.update', (updates: any[]) => {
      for (const update of updates) {
        if (update.id) {
          const old = syncService.contacts.get(update.id) || {};
          syncService.contacts.set(update.id, safeMerge(old, update));
        }
      }
      syncService.updateMappings(updates);
      syncService.save();
    });

    this.sock.ev.on('chats.upsert', (newChats: any[]) => {
      for (const chat of newChats) {
        if (chat.id) syncService.chats.set(chat.id, chat);
      }
      syncService.save();
    });

    this.sock.ev.on('chats.update', (updates: any[]) => {
      for (const update of updates) {
        if (update.id) {
          const old = syncService.chats.get(update.id) || {};
          syncService.chats.set(update.id, safeMerge(old, update));
        }
      }
      syncService.save();
    });

    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!this.pairingRequested) return;
        const s = db.getSettings();
        if (s.whatsapp_pairing_method === 'qr') {
          this.pairingData = { type: 'qr', data: qr, connected: false, authenticated: false };
          log('CONN', 'QR Code generated');
          this.broadcast('status', this.pairingData);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        log('CONN', `Connection closed: ${reason} (code: ${statusCode})`);
        this.isReady = false;
        this.isAuthenticated = false;
        this.broadcast('status', { connected: false, authenticated: false, reason });

        const isRegistered = this.sock?.authState?.creds?.registered;

        if (statusCode === 440 || !this.sock) {
          log('CONN', 'Ignoring connection close for conflict or null socket.');
          return;
        }

        const isTerminal = isRegistered && [DisconnectReason.loggedOut, 401, 403, 411].includes(statusCode);

        if (isTerminal) {
          log('CONN', `Terminal disconnect (code ${statusCode}). Clearing auth state and restarting...`);
          try {
            await rm(AUTH_DIR, { recursive: true, force: true });
            mkdirSync(AUTH_DIR, { recursive: true });
            syncService.chats.clear();
            syncService.contacts.clear();
            log('CONN', 'Auth state and cache cleared.');
          } catch (e: any) {
            log('CONN', 'Failed to clear auth state: ' + e.message);
          }
          this.reconnectAttempts = 0;
          this.lastPairingCodeRequest = 0;
          setTimeout(() => this.start(), 5000);
        } else {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
          log('CONN', `Temporary disconnect. Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.start(), delay);
        }
      } else if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.isReady = true;
        this.isAuthenticated = true;
        this.myId = jidNormalizedUser(this.sock.user.id);
        this.pairingData = { type: null, data: null, connected: true, authenticated: true, id: this.myId };
        log('CONN', `Connected as ${this.myId}`);
        this.broadcast('status', { connected: true, authenticated: true, id: this.myId });
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: WAMessage[], type: string }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const msg of messages) {
        try {
          if (this.processor) await this.processor.handleMessage(msg);
        } catch (e: any) {
          log('CONN', 'Unhandled error in handleMessage: ' + e.message + '\n' + e.stack);
        }
      }
    });

    // Handle incoming message updates (specific to the 'REVOKE' status)
    this.sock.ev.on('messages.update', async (events: any[]) => {
      for (const event of events) {
        if (this.processor) await this.processor.handleMessageUpdate(event);
      }
    });
  }

  /**
   * Aggregates and returns all available chats, merging metadata from contacts,
   * groups, and LID/PN mapping services to provide a unified list.
   */
  public async getWhatsAppChats() {
    if (!this.isReady || !this.sock) return [];
    try {
      // Query Baileys for all groups the user is currently a participant in
      try {
        const allGroups = await this.sock.groupFetchAllParticipating();
        for (const [id, group] of Object.entries(allGroups)) {
          if (!syncService.chats.has(id)) {
            syncService.chats.set(id, { id, name: (group as any).subject });
          }
        }
      } catch (e: any) {
        log('CONN', 'Failed to fetch all participating groups: ' + e.message);
      }

      // Enrich the chat list by merging stored contact information for private threads
      const blockedDomains = ['@g.us', '@broadcast', '@newsletter'];

      await Promise.all(Array.from(syncService.contacts.entries()).map(async ([id, contact]) => {
        if (!id || blockedDomains.some(domain => id.endsWith(domain))) return;

        let preferredName = contact.name || contact.verifiedName || contact.notify || contact.pushname || '';

        // Attempt to resolve the Phone Number name for an LID contact if both exist
        if (!preferredName && id.includes('@lid') && contact.phoneNumber) {
          const pnInfo = syncService.contacts.get(contact.phoneNumber + '@s.whatsapp.net') || syncService.contacts.get(contact.phoneNumber);
          if (pnInfo) {
            preferredName = pnInfo.name || pnInfo.verifiedName || pnInfo.notify || pnInfo.pushname || '';
          }
        }

        // Resolve LID to Phone Number (PN) using the internal signal repository
        let targetId = id;
        if (id.includes('@lid') && this.sock?.signalRepository?.lidMapping) {
          try {
            const pn = await this.sock.signalRepository.lidMapping.getPNForLID(id);
            if (pn) {
              targetId = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
            }
          } catch (e: any) {
            log('CONN', `Failed to get PN for LID ${id} during chat sync: ${e.message}`);
          }
        }

        if (!syncService.chats.has(targetId)) {
          syncService.chats.set(targetId, { id: targetId, name: preferredName });
        } else {
          const c = syncService.chats.get(targetId);
          if (preferredName && (!c.name || c.name === targetId.split('@')[0] || c.name.includes(targetId.split('@')[0]))) {
            syncService.chats.set(targetId, { ...c, name: preferredName });
          }
        }
      }));

      // Consolidate redundant chat entries (specifically deduplicating LID and PN variants)
      const dedupedMap = new Map();
      const chatBlockedDomains = ['@broadcast', '@newsletter'];

      for (const [id, c] of syncService.chats.entries()) {
        if (!id || chatBlockedDomains.some(domain => id.endsWith(domain))) continue;

        let baseId = id;
        if (id.includes('@lid')) {
          baseId = syncService.lidToPn.get(id) || id;
        }

        const existing = dedupedMap.get(baseId) || { ...c, id: baseId, lids: [] };

        // Retain meaningful names
        if (c.name && (!existing.name || existing.name === existing.id.split('@')[0])) {
          existing.name = c.name;
        }

        // Track lids
        if (id.includes('@lid') && !existing.lids.includes(id)) {
          existing.lids.push(id.split('@')[0]);
        }

        // Also check mapped LID for this PN
        if (baseId.includes('@s.whatsapp.net')) {
          const m_lid = syncService.pnToLid.get(baseId) || null;
          if (m_lid && !existing.lids.includes(m_lid)) {
            existing.lids.push(m_lid.split('@')[0]);
          }
        }

        // Ensure LID and PN entries for the same contact are permanently merged under the PN
        if (id !== baseId) {
          syncService.chats.delete(id);
          if (!syncService.chats.has(baseId)) {
            syncService.chats.set(baseId, existing);
          } else {
            syncService.chats.set(baseId, safeMerge(syncService.chats.get(baseId), existing));
          }
        }

        // Timestamp merge
        const cTs = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
        const eTs = existing.conversationTimestamp?.low || existing.conversationTimestamp || 0;
        if (cTs > eTs) existing.conversationTimestamp = cTs;

        dedupedMap.set(baseId, existing);
      }

      const allChats = Array.from(dedupedMap.values());
      const monitored = new Set<string>(db.getMonitoredChats().map((m: any) => m.chat_id));

      // Batch fetch profile pics
      const profilePics = db.getChatProfilePics ? db.getChatProfilePics(allChats.map((c: any) => c.id)) : {};

      // Expand monitored set with LID<->PN mappings
      if (this.sock?.signalRepository?.lidMapping) {
        await Promise.all(Array.from(monitored).map(async (jid: any) => {
          try {
            if (jid.includes('@lid')) {
              const pn = await this.sock.signalRepository.lidMapping.getPNForLID(jid);
              if (pn) monitored.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
            } else if (jid.includes('@s.whatsapp.net')) {
              const lid = await this.sock.signalRepository.lidMapping.getLIDForPN(jid);
              if (lid) monitored.add(lid.includes('@lid') ? lid : lid + '@lid');
            }
          } catch (e: any) {
            log('CONN', `Failed to map LID/PN for monitored chat ${jid}: ${e.message}`);
          }
        }));
      }

      log('CONN', `Available chats: ${allChats.length} (contacts: ${syncService.contacts.size}, chats: ${syncService.chats.size})`);

      // Construct the final list of chat objects with latest metadata and monitoring status
      const results = await Promise.all(allChats.map(async (c: any) => {
        const isGrp = isJidGroup(c.id);
        let name = c.name || c.notify || '';

        if (!name || name === c.id.split('@')[0]) {
          name = getChatName(c.id);
        }

        const ts = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
        return {
          id: c.id,
          name: name,
          isGroup: isGrp,
          timestamp: ts,
          isMonitored: monitored.has(c.id),
          profilePic: (profilePics as any)[c.id] || null,
          lid: c.lids && c.lids.length > 0 ? c.lids[0].split('@')[0] : (c.id.includes('@lid') ? c.id.split('@')[0] : null)
        };
      }));

      // Refresh profile pictures for all monitored chats in the background
      const monitoredChatsToFetch = results.filter(c => c.isMonitored).slice(0, 30);
      Promise.all(monitoredChatsToFetch.map(c => this.getProfilePic(c.id)))
        .catch((e: any) => log('CONN', `Error refreshing monitored profile pictures: ${e.message}`));

      return results.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e: any) {
      log('CONN', `Error getting chats: ${e.message}`);
      return [];
    }
  }

  public async getProfilePic(jid: string) {
    if (!jid || !this.sock) return null;
    const existing = db.getChatProfilePic(jid);
    if (existing) return existing;

    try {
      const url = await this.sock.profilePictureUrl(jid, 'image').catch(() => null);
      if (!url) return null;

      const filename = `dp_${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      const filepath = join(MEDIA_DIR, filename);
      const res = await fetch(url);
      if (!res.ok) return null;

      const { writeFile } = await import('fs/promises');
      await writeFile(filepath, Buffer.from(await res.arrayBuffer()));
      db.updateChatProfilePic(jid, filename);
      return filename;
    } catch (e: any) {
      log('CONN', `Error getting profile picture for ${jid}: ${e.message}`);
      return null;
    }
  }

  public async reset(requestPairing = true) {
    log('CONN', `Manual reset requested. (Request Pairing: ${requestPairing}) Clearing auth and restarting...`);
    this.pairingRequested = requestPairing;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        await this.sock.logout();
        this.sock.end();
      } catch (e: any) { log('CONN', `Logout error: ${e.message}`); }
      this.sock = null;
    }

    await rm(AUTH_DIR, { recursive: true, force: true });
    mkdirSync(AUTH_DIR, { recursive: true });

    this.pairingData = { type: null, data: null, connected: false, authenticated: false };
    this.isReady = false;
    this.isAuthenticated = false;
    syncService.chats.clear();
    syncService.contacts.clear();
    this.reconnectAttempts = 0;
    this.lastPairingCodeRequest = 0;
    this.broadcast('status', { connected: false, authenticated: false, reason: 'Manual reset' });

    setTimeout(() => {
      if (!this.sock) this.start();
    }, 2000);
  }

  /**
   * Completely purges a chat from the local system, including all linked JID variants (LID and PN).
   */
  public async deleteChatFully(chatId: string) {
    const relatedIds = new Set([chatId]);

    // Check mapping caches
    if (chatId.includes('@lid')) {
      const pn = syncService.lidToPn.get(chatId);
      if (pn && pn !== chatId) relatedIds.add(pn);
    } else {
      const lid = syncService.pnToLid.get(chatId);
      if (lid) relatedIds.add(lid);
    }

    // Check Baileys repository
    if (this.sock?.signalRepository?.lidMapping) {
      try {
        if (chatId.includes('@lid')) {
          const pn = await this.sock.signalRepository.lidMapping.getPNForLID(chatId);
          if (pn) relatedIds.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (chatId.includes('@s.whatsapp.net')) {
          const lid = await this.sock.signalRepository.lidMapping.getLIDForPN(chatId);
          if (lid) relatedIds.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e: any) {
        log('CONN', `Failed to get LID/PN mapping during chat deletion for ${chatId}: ${e.message}`);
      }
    }

    // Fallbacks from contacts
    for (const [c_jid, c_info] of syncService.contacts.entries()) {
      if (chatId.includes('@lid') && c_info.lid && (c_info.lid === chatId || c_info.lid.includes(chatId.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        relatedIds.add(c_jid);
      }
      if (c_jid === chatId && c_info.phoneNumber) {
        relatedIds.add(c_info.phoneNumber + '@s.whatsapp.net');
      }
    }

    const ids = Array.from(relatedIds);
    log('CONN', `Purging local data for IDs: ${ids.join(', ')}`);

    if (ids.length > 0) {
      db.deleteChatsAndMessages(ids);
      for (const id of ids) {
        db.removeMonitoredChat(id);
      }
    }
  }

  public getPairingData(): PairingStatus {
    return this.pairingData;
  }

  public getNotifyEnabled(): boolean {
    return this.notifyWhatsApp;
  }

  public setNotifyEnabled(enabled: boolean) {
    this.notifyWhatsApp = !!enabled;
    log('CONN', `Notification forwarding ${this.notifyWhatsApp ? 'enabled' : 'disabled'}`);
  }
}
