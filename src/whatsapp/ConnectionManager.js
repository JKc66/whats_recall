import makeWASocket, { DisconnectReason, useMultiFileAuthState, jidNormalizedUser } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { log } from '../logger.js';
import pino from 'pino';
import { mkdirSync } from 'fs';
import { safeMerge } from './StoreManager.js';

export class ConnectionManager {
  constructor(monitor, storeManager, db, broadcast, BAILEYS_DATA_DIR) {
    this.monitor = monitor;
    this.store = storeManager;
    this.db = db;
    this.broadcast = broadcast;
    this.BAILEYS_DATA_DIR = BAILEYS_DATA_DIR;
    this.isInitializing = false;
  }

  async deleteDirRecursive(path) {
    const { rm } = await import('fs/promises');
    await rm(path, { recursive: true, force: true });
  }

  async resetWhatsAppSession(requestPairing = true) {
    log('WA', `Manual reset requested. (Request Pairing: ${requestPairing}) Clearing auth and restarting...`);
    this.monitor.pairingRequested = requestPairing;
    if (this.monitor.client) {
      try {
        this.monitor.client.ev.removeAllListeners('connection.update');
        await this.monitor.client.logout();
        this.monitor.client.end();
      } catch (e) {
        log('WA', 'Logout error: ' + e.message);
      }
      this.monitor.client = null;
    }
    await this.deleteDirRecursive(this.BAILEYS_DATA_DIR);
    mkdirSync(this.BAILEYS_DATA_DIR, { recursive: true });
    this.monitor.pairingData = { type: null, data: null };
    this.monitor.clientReady = false;
    this.monitor.clientAuthenticated = false;
    this.store.clear();
    this.monitor.reconnectAttempts = 0;
    this.monitor.lastPairingCodeRequest = 0;
    this.broadcast('status', { connected: false, authenticated: false, reason: 'Manual reset' });
    // Start fresh: will re-read settings internally
    setTimeout(() => {
      if (!this.monitor.client) this.monitor.start();
    }, 2000);
  }

  async start() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (this.monitor.client) {
        log('WA', 'Closing existing socket before re-initializing...');
        try {
          this.monitor.client.ev.removeAllListeners('connection.update');
          this.monitor.client.end();
          this.monitor.client = null;
        } catch (e) {
          log('WA', 'Error closing socket: ' + e.message);
        }
      }

      log('WA', 'Initializing Baileys Socket...');
      const { state, saveCreds } = await useMultiFileAuthState(this.BAILEYS_DATA_DIR);

      // We import locally within the function to not clutter the top
      const { fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
      let version;
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
      } catch {
        version = [2, 3000, 1015901307];
      }

      const { phone: phoneNumber, method: pairingMethod } = this.monitor.getSettings();

      // Before creating socket, decide if we even want a QR right now
      const isRegistered = state?.creds?.registered;
      const printQR = !isRegistered && pairingMethod === 'qr' && this.monitor.pairingRequested;

      this.monitor.client = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: printQR,
        logger: pino({ level: 'silent' }),
        syncFullHistory: true,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '20.0.0']
      });

      this.monitor.client.ev.on('creds.update', saveCreds);

      // Only attempt to get a code or QR if we are registered OR if pairing was explicitly requested
      if (!isRegistered && !this.monitor.pairingRequested) {
        log('WA', 'Auth not registered. Waiting for explicit pairing request from UI.');

        // Ensure no events try to do things
        if (this.monitor.client && this.monitor.client.ev) {
          this.monitor.client.ev.removeAllListeners('connection.update');
          // Disconnect completely to stop QR spinning behind scenes
          this.monitor.client.end();
          this.monitor.client = null;
        }

      } else if (phoneNumber && pairingMethod === 'code' && !this.monitor.client.authState.creds.registered) {
        const now = Date.now();
        if (now - this.monitor.lastPairingCodeRequest > 60000) {
          setTimeout(async () => {
            try {
              if (!this.monitor.client || this.monitor.client.authState.creds.registered) return;
              const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
              const code = await this.monitor.client.requestPairingCode(formattedPhone);
              this.monitor.lastPairingCodeRequest = Date.now();
              const readableCode = code?.match(/.{1,4}/g)?.join('-') || code;
              this.monitor.pairingData = { type: 'code', data: readableCode };
              log('WA', `📱 Pairing code generated: ${readableCode}`);
            } catch (err) {
              log('WA', 'Failed to request pairing code: ' + err.message);
            }
          }, 3000);
        } else {
          log('WA', 'Using existing pairing code (cooldown active)');
        }
      }
    } finally {
      this.isInitializing = false;
    }

    if (!this.monitor.client) return; // If we aborted initialization (e.g. waiting for request)

    this.setupEventListeners();
  }

  setupEventListeners() {
    const sock = this.monitor.client;

    sock.ev.on('messaging-history.set', ({ chats: historyChats, contacts: historyContacts, isLatest }) => {
      if (historyChats?.length || historyContacts?.length) {
        log('WA', `History sync: ${historyChats?.length || 0} chats, ${historyContacts?.length || 0} contacts (isLatest: ${isLatest})`);
      }
      this.store.upsertContacts(historyContacts || []);
      this.store.upsertChats(historyChats || []);
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
      log('WA', `Contacts upsert: ${newContacts.length} contacts`);
      this.store.upsertContacts(newContacts);
    });

    sock.ev.on('contacts.set', ({ contacts: newContacts }) => {
      if (!newContacts) return;
      log('WA', `Contacts set: ${newContacts.length} contacts`);
      this.store.upsertContacts(newContacts);
    });

    sock.ev.on('chats.set', ({ chats: newChats }) => {
      if (!newChats) return;
      log('WA', `Chats set: ${newChats.length} chats`);
      this.store.upsertChats(newChats);
    });

    sock.ev.on('groups.upsert', (newGroups) => {
      for (const group of newGroups) {
        if (group.id) {
          const existing = this.store.chats.get(group.id) || {};
          this.store.chats.set(group.id, safeMerge(existing, { id: group.id, name: group.subject }));
        }
      }
      this.store.saveCache();
    });

    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          const existing = this.store.chats.get(update.id) || {};
          this.store.chats.set(update.id, { ...existing, id: update.id, name: update.subject });
        }
      }
      this.store.saveCache();
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = this.store.contacts.get(update.id) || {};
          this.store.contacts.set(update.id, safeMerge(old, update));
        }
      }
      this.store.updateMappings(updates);
      this.store.saveCache();
    });

    sock.ev.on('chats.upsert', (newChats) => {
      for (const chat of newChats) {
        if (chat.id) this.store.chats.set(chat.id, chat);
      }
      this.store.saveCache();
    });

    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = this.store.chats.get(update.id) || {};
          this.store.chats.set(update.id, safeMerge(old, update));
        }
      }
      this.store.saveCache();
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!this.monitor.pairingRequested) return; // Ignore QR if not explicitly requested
        const { method } = this.monitor.getSettings();
        if (method === 'qr') {
          this.monitor.pairingData = { type: 'qr', data: qr };
          log('WA', 'QR Code generated');
          log('WA', '========================================');
          qrcode.generate(qr, { small: true });
          log('WA', '========================================');
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';
        const errorStack = lastDisconnect?.error?.stack || '';

        log('WA', `Connection closed: ${reason} (code: ${statusCode}). ${errorStack}`);
        this.monitor.clientReady = false;
        this.monitor.clientAuthenticated = false;
        this.broadcast('status', { connected: false, authenticated: false, reason });

        const isRegistered = sock?.authState?.creds?.registered;

        // If we were explicitly closed/reset, don't try to reconnect here - resetWhatsAppSession or start() handles it.
        if (statusCode === 440 || !sock) {
          log('WA', 'Ignoring connection close for conflict or null socket - replacement should already be active.');
          return;
        }

        // Only treat 401/403/411 as terminal if we were previously fully registered.
        // If not registered, a 401 might just be a pairing timeout, so we back off instead of aggressive looping.
        const isTerminal = isRegistered && [DisconnectReason.loggedOut, 401, 403, 411].includes(statusCode);

        if (isTerminal) {
          log('WA', `Terminal disconnect (code ${statusCode}). Clearing auth state and restarting...`);
          try {
            const { rm } = await import('fs/promises');
            await rm(this.BAILEYS_DATA_DIR, { recursive: true, force: true });
            mkdirSync(this.BAILEYS_DATA_DIR, { recursive: true });
            this.store.clear();
            log('WA', 'Auth state and cache cleared. Will show QR/pairing code on reconnect.');
          } catch (e) {
            log('WA', 'Failed to clear auth state: ' + e.message);
          }
          this.monitor.reconnectAttempts = 0;
          this.monitor.lastPairingCodeRequest = 0;
          setTimeout(() => {
            this.monitor.start();
          }, 5000);
        } else {
          this.monitor.reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, this.monitor.reconnectAttempts - 1), 60000);
          log('WA', `Temporary disconnect. Reconnecting in ${delay / 1000}s... (Attempt ${this.monitor.reconnectAttempts})`);
          setTimeout(() => {
            this.monitor.start();
          }, delay);
        }
      } else if (connection === 'open') {
        this.monitor.reconnectAttempts = 0;
        this.monitor.clientReady = true;
        this.monitor.clientAuthenticated = true;
        this.monitor.myId = jidNormalizedUser(sock.user.id);
        log('WA', `Ready — monitoring messages (logged in as: ${this.monitor.myId})`);
        this.broadcast('status', { connected: true, authenticated: true, id: this.monitor.myId });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const msg of messages) {
        try {
          await this.monitor.messageHandler.handleMessage(msg);
        } catch (e) {
          log('WA', 'Unhandled error in handleMessage: ' + e.message + '\n' + e.stack);
        }
      }
    });

    sock.ev.on('messages.update', async (events) => {
      for (const event of events) {
        await this.monitor.messageHandler.handleMessageUpdate(event);
      }
    });
  }
}
