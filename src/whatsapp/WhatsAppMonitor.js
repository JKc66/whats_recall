import { isJidGroup } from '@whiskeysockets/baileys';
import { log } from '../logger.js';
import { StoreManager } from './StoreManager.js';
import { ConnectionManager } from './ConnectionManager.js';
import { JidResolver } from './JidResolver.js';
import { MediaHandler } from './MediaHandler.js';
import { NotificationManager } from './NotificationManager.js';
import { MessageHandler } from './MessageHandler.js';

const BAILEYS_DATA_DIR = './data/baileys_auth';

export class WhatsAppMonitor {
  constructor(db, broadcast) {
    this.db = db;
    this.broadcast = broadcast;
    this.client = null;
    this.clientReady = false;
    this.clientAuthenticated = false;
    this.myId = null;
    this.pairingData = { type: null, data: null };
    this.reconnectAttempts = 0;
    this.lastPairingCodeRequest = 0;
    this.pairingRequested = false;

    this.getSettings = () => {
      const s = this.db.getSettings();
      return {
        phone: s.whatsapp_phone || '',
        notify: s.whatsapp_notify === 'true',
        method: s.whatsapp_pairing_method || 'code' // 'code' or 'qr'
      };
    };

    let { notify: notifyWhatsApp } = this.getSettings();
    this.notifyWhatsApp = notifyWhatsApp;

    setInterval(() => {
      const s = this.getSettings();
      this.notifyWhatsApp = s.notify;
    }, 10000);

    // Initialize modules
    this.storeManager = new StoreManager(BAILEYS_DATA_DIR);
    this.storeManager.loadCache();

    this.connectionManager = new ConnectionManager(this, this.storeManager, this.db, this.broadcast, BAILEYS_DATA_DIR);
    this.jidResolver = new JidResolver(this.db, this.storeManager, this);
    this.mediaHandler = new MediaHandler(this.db, this);
    this.notificationManager = new NotificationManager(this);
    this.messageHandler = new MessageHandler(
      this.db,
      this.storeManager,
      this.jidResolver,
      this.mediaHandler,
      this.notificationManager,
      this,
      this.broadcast
    );
  }

  start() {
    return this.connectionManager.start();
  }

  resetWhatsAppSession(requestPairing = true) {
    return this.connectionManager.resetWhatsAppSession(requestPairing);
  }

  isReady() {
    return this.clientReady;
  }

  isAuthenticated() {
    return this.clientAuthenticated;
  }

  getMyId() {
    return this.myId;
  }

  getNotifyEnabled() {
    return this.notifyWhatsApp;
  }

  setNotifyEnabled(enabled) {
    this.notifyWhatsApp = !!enabled;
    log('WA', `Notification forwarding ${this.notifyWhatsApp ? 'enabled' : 'disabled'}`);
  }

  getPairingStatus() {
    return {
      ...this.pairingData,
      connected: this.clientReady,
      authenticated: !!(this.client?.authState?.creds?.registered || this.clientAuthenticated)
    };
  }

  async deleteChatFully(chatId) {
    // Collect all related IDs (LIDs + PNs) so we can thoroughly purge from DB
    const relatedIds = new Set([chatId]);

    // Check mapping caches first
    if (chatId.includes('@lid')) {
      const pn = this.jidResolver.resolveToPNLocal(chatId);
      if (pn !== chatId) relatedIds.add(pn);
    } else {
      const lid = this.jidResolver.resolveToLIDLocal(chatId);
      if (lid) relatedIds.add(lid);
    }

    // Check Baileys' repository as fallback
    if (this.client?.signalRepository?.lidMapping) {
      try {
        if (chatId.includes('@lid')) {
          const pn = await this.client.signalRepository.lidMapping.getPNForLID(chatId);
          if (pn) relatedIds.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (chatId.includes('@s.whatsapp.net')) {
          const lid = await this.client.signalRepository.lidMapping.getLIDForPN(chatId);
          if (lid) relatedIds.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e) { }
    }

    // Fallbacks from contacts
    for (const [c_jid, c_info] of this.storeManager.contacts.entries()) {
      if (chatId.includes('@lid') && c_info.lid && (c_info.lid === chatId || c_info.lid.includes(chatId.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        relatedIds.add(c_jid);
      }
      if (c_jid === chatId && c_info.phoneNumber) {
        relatedIds.add(c_info.phoneNumber + '@s.whatsapp.net');
      }
    }

    const ids = Array.from(relatedIds);
    log('WA', `Purging local data for IDs: ${ids.join(', ')}`);

    const { deleteChatsAndMessages, removeMonitoredChat } = this.db;

    if (ids.length > 0) {
      await deleteChatsAndMessages(ids);
      for (const id of ids) {
        removeMonitoredChat(id);
      }
    }
  }

  async getWhatsAppChats() {
    if (!this.clientReady) return [];
    try {
      if (this.clientReady && this.client) {
        try {
          const allGroups = await this.client.groupFetchAllParticipating();
          for (const [id, group] of Object.entries(allGroups)) {
            if (!this.storeManager.chats.has(id)) {
              this.storeManager.chats.set(id, { id, name: group.subject });
            }
          }
        } catch (e) {
          log('WA', 'Failed to fetch all participating groups: ' + e.message);
        }
      }

      // Merge contacts into chats map so private contacts show up too
      const resolvedIds = new Map(); // Cache LID to PN mapping for this loop
      const blockedDomains = ['@g.us', '@broadcast', '@newsletter'];

      for (const [id, contact] of this.storeManager.contacts.entries()) {
        if (!id || blockedDomains.some(domain => id.endsWith(domain))) continue;

        let preferredName = contact.name || contact.verifiedName || contact.notify || contact.pushname || '';

        // Try mapping LID to its phone contact name
        if (!preferredName && id.includes('@lid') && contact.phoneNumber) {
          const pnInfo = this.storeManager.contacts.get(contact.phoneNumber + '@s.whatsapp.net') || this.storeManager.contacts.get(contact.phoneNumber);
          if (pnInfo) {
            preferredName = pnInfo.name || pnInfo.verifiedName || pnInfo.notify || pnInfo.pushname || '';
          }
        }

        // Use the common mapping logic
        let targetId = id;
        if (id.includes('@lid') && this.client?.signalRepository?.lidMapping) {
          try {
            const pn = await this.client.signalRepository.lidMapping.getPNForLID(id);
            if (pn) {
              targetId = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
              resolvedIds.set(id, targetId);
            }
          } catch (e) { }
        }

        if (!this.storeManager.chats.has(targetId)) {
          this.storeManager.chats.set(targetId, { id: targetId, name: preferredName });
        } else {
          const c = this.storeManager.chats.get(targetId);
          if (preferredName && (!c.name || c.name === targetId.split('@')[0] || c.name.includes(targetId.split('@')[0]))) {
            this.storeManager.chats.set(targetId, { ...c, name: preferredName });
          }
        }
      }

      const dedupedMap = new Map();
      const chatBlockedDomains = ['@broadcast', '@newsletter'];

      for (const [id, c] of this.storeManager.chats.entries()) {
        if (!id || chatBlockedDomains.some(domain => id.endsWith(domain))) continue;

        let baseId = id;
        if (id.includes('@lid')) {
          baseId = this.jidResolver.resolveToPNLocal(id);
        }

        let existing = dedupedMap.get(baseId) || { ...c, id: baseId, lids: [] };

        // Retain meaningful names
        if (c.name && (!existing.name || existing.name === existing.id.split('@')[0])) {
          existing.name = c.name;
        }

        // Track lids
        if (id.includes('@lid') && !existing.lids.includes(id)) {
          existing.lids.push(id.split('@')[0]);
        }

        // Also check if we have a mapped LID for this PN from our maps
        if (baseId.includes('@s.whatsapp.net')) {
          const m_lid = this.jidResolver.resolveToLIDLocal(baseId);
          if (m_lid && !existing.lids.includes(m_lid)) {
            existing.lids.push(m_lid.split('@')[0]);
          }
        }

        // --- MERGE FIX: Ensure we move the LID to the PN entry permanently ---
        if (id !== baseId) {
          this.storeManager.chats.delete(id);
        }

        // If c has conversationTimestamp and existing doesn't or existing's is older, update it
        let cTs = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
        let eTs = existing.conversationTimestamp?.low || existing.conversationTimestamp || 0;
        if (cTs > eTs) existing.conversationTimestamp = cTs;

        dedupedMap.set(baseId, existing);
      }

      const allChats = Array.from(dedupedMap.values());
      const monitored = new Set(this.db.getMonitoredChats().map(m => m.chat_id));

      // Batch fetch profile pics for all chats to avoid N+1 queries during mapping
      const profilePics = this.db.getChatProfilePics(allChats.map(c => c.id));

      // Expand monitored set with mapped LIDs and PNs so UI reflects status correctly for both formats
      if (this.client?.signalRepository?.lidMapping) {
        await Promise.all(Array.from(monitored).map(async (jid) => {
          try {
            if (jid.includes('@lid')) {
              const pn = await this.client.signalRepository.lidMapping.getPNForLID(jid);
              if (pn) monitored.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
            } else if (jid.includes('@s.whatsapp.net')) {
              const lid = await this.client.signalRepository.lidMapping.getLIDForPN(jid);
              if (lid) monitored.add(lid.includes('@lid') ? lid : lid + '@lid');
            }
          } catch (e) { }
        }));
      }
      log('WA', `Available chats: ${allChats.length} (contacts: ${this.storeManager.contacts.size}, chats: ${this.storeManager.chats.size})`);

      const results = await Promise.all(allChats
        .map(async c => {
          const isGroup = isJidGroup(c.id);
          let name = c.name || c.notify || '';

          if (!name || name === c.id.split('@')[0]) {
            name = await this.jidResolver.getChatName(c.id);
          }

          const ts = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
          return {
            id: c.id,
            name: name,
            isGroup: isGroup,
            timestamp: ts,
            isMonitored: monitored.has(c.id),
            profilePic: profilePics[c.id] || null,
            lid: c.lids && c.lids.length > 0 ? c.lids[0].split('@')[0] : (c.id.includes('@lid') ? c.id.split('@')[0] : null)
          };
        }));

      // Fire and forget profiles ONLY for monitored chats to save disk space
      const monitoredChatsToFetch = results.filter(c => c.isMonitored).slice(0, 30);
      Promise.all(monitoredChatsToFetch.map(c => this.jidResolver.getProfilePic(c.id))).catch(() => { });

      return results.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      log('WA', 'Error getting chats: ' + e.message);
      return [];
    }
  }
}
