import makeWASocket, { DisconnectReason, useMultiFileAuthState, downloadMediaMessage, getContentType, jidNormalizedUser, isJidGroup, extractMessageContent } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { MEDIA_DIR } from './database.js';
import { log } from './logger.js';
import pino from 'pino';
import WS from 'ws';

// Patch ws to suppress Bun warnings for unimplemented events
const originalOn = WS.prototype.on;
WS.prototype.on = function (event) {
  if (event === 'upgrade' || event === 'unexpected-response') return this;
  return originalOn.apply(this, arguments);
};


// Ensure data dirs
const BAILEYS_DATA_DIR = './data/baileys_auth';
if (!existsSync(BAILEYS_DATA_DIR)) mkdirSync(BAILEYS_DATA_DIR, { recursive: true });

const deleteDirRecursive = async (path) => {
  const { rm } = await import('fs/promises');
  await rm(path, { recursive: true, force: true });
};

function safeMerge(oldObj, newObj) {
  const merged = { ...oldObj };
  for (const key in newObj) {
    if (newObj[key] !== undefined && newObj[key] !== null) {
      merged[key] = newObj[key];
    }
  }
  return merged;
}

export function createMonitor(db, broadcast) {
  let sock = null;
  let clientReady = false;
  let clientAuthenticated = false;
  let myId = null;
  let pairingData = { type: null, data: null };
  let reconnectAttempts = 0;
  let lastPairingCodeRequest = 0;
  let isInitializing = false;
  let pairingRequested = false;

  const getSettings = () => {
    const s = db.getSettings();
    return {
      phone: s.whatsapp_phone || '',
      notify: s.whatsapp_notify === 'true',
      method: s.whatsapp_pairing_method || 'code' // 'code' or 'qr'
    };
  };

  let { notify: notifyWhatsApp } = getSettings();

  const resetWhatsAppSession = async (requestPairing = true) => {
    log('WA', `Manual reset requested. (Request Pairing: ${requestPairing}) Clearing auth and restarting...`);
    pairingRequested = requestPairing;
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update');
        await sock.logout();
        sock.end();
      } catch (e) {
        log('WA', 'Logout error: ' + e.message);
      }
      sock = null;
    }
    await deleteDirRecursive(BAILEYS_DATA_DIR);
    mkdirSync(BAILEYS_DATA_DIR, { recursive: true });
    pairingData = { type: null, data: null };
    clientReady = false;
    clientAuthenticated = false;
    chats.clear();
    contacts.clear();
    reconnectAttempts = 0;
    lastPairingCodeRequest = 0;
    broadcast('status', { connected: false, authenticated: false, reason: 'Manual reset' });
    // Start fresh: will re-read settings internally
    setTimeout(() => {
      if (!sock) start();
    }, 2000);
  };

  // Only update simple preferences live, NO auto-restarts for phone/method
  setInterval(() => {
    const s = getSettings();
    notifyWhatsApp = s.notify;
  }, 10000);

  const contacts = new Map();
  const chats = new Map();
  const lidToPn = new Map();
  const pnToLid = new Map();

  const updateMappings = (items) => {
    for (const item of items) {
      if (!item.id) continue;
      if (item.id.includes('@lid') && item.phoneNumber) {
        const pn = item.phoneNumber.includes('@s.whatsapp.net') ? item.phoneNumber : (item.phoneNumber + '@s.whatsapp.net');
        lidToPn.set(item.id, pn);
        pnToLid.set(pn, item.id);
      } else if (item.id.includes('@s.whatsapp.net') && item.lid) {
        const lid = item.lid.includes('@lid') ? item.lid : (item.lid + '@lid');
        pnToLid.set(item.id, lid);
        lidToPn.set(lid, item.id);
      }
    }
  };

  const CACHE_FILE = join(BAILEYS_DATA_DIR, 'store_cache.json');
  try {
    if (existsSync(CACHE_FILE)) {
      const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      if (cache.contacts) {
        cache.contacts.forEach(c => contacts.set(c.id, c));
        updateMappings(cache.contacts);
      }
      if (cache.chats) cache.chats.forEach(c => chats.set(c.id, c));
      log('WA', `Restored ${contacts.size} contacts and ${chats.size} chats from cache (mappings: ${lidToPn.size})`);
    }
  } catch (e) {
    log('WA', 'Failed to restore store cache: ' + e.message);
  }

  let saveTimer = null;
  function saveCache() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      try {
        const data = {
          contacts: Array.from(contacts.values()),
          chats: Array.from(chats.values())
        };
        await writeFile(CACHE_FILE, JSON.stringify(data));
      } catch (e) {
        log('WA', 'Failed to save store cache: ' + e.message);
      }
      saveTimer = null;
    }, 10000);
  }

  const start = async () => {
    if (isInitializing) return;
    isInitializing = true;

    try {
      if (sock) {
        log('WA', 'Closing existing socket before re-initializing...');
        try {
          sock.ev.removeAllListeners('connection.update');
          sock.end();
          sock = null;
        } catch (e) {
          log('WA', 'Error closing socket: ' + e.message);
        }
      }

      log('WA', 'Initializing Baileys Socket...');
      const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_DATA_DIR);

      // We import locally within the function to not clutter the top
      const { fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
      let version;
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
      } catch {
        version = [2, 3000, 1015901307];
      }

      const { phone: phoneNumber, method: pairingMethod } = getSettings();

      // Before creating socket, decide if we even want a QR right now
      const isRegistered = state?.creds?.registered;
      const printQR = !isRegistered && pairingMethod === 'qr' && pairingRequested;

      sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: printQR,
        logger: pino({ level: 'silent' }),
        syncFullHistory: true,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '20.0.0']
      });

      sock.ev.on('creds.update', saveCreds);

      // Only attempt to get a code or QR if we are registered OR if pairing was explicitly requested
      if (!isRegistered && !pairingRequested) {
        log('WA', 'Auth not registered. Waiting for explicit pairing request from UI.');

        // Ensure no events try to do things
        if (sock && sock.ev) {
          sock.ev.removeAllListeners('connection.update');
          // Disconnect completely to stop QR spinning behind scenes
          sock.end();
          sock = null;
        }

      } else if (phoneNumber && pairingMethod === 'code' && !sock.authState.creds.registered) {
        const now = Date.now();
        if (now - lastPairingCodeRequest > 60000) {
          setTimeout(async () => {
            try {
              if (!sock || sock.authState.creds.registered) return;
              const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
              const code = await sock.requestPairingCode(formattedPhone);
              lastPairingCodeRequest = Date.now();
              const readableCode = code?.match(/.{1,4}/g)?.join('-') || code;
              pairingData = { type: 'code', data: readableCode };
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
      isInitializing = false;
    }

    if (!sock) return; // If we aborted initialization (e.g. waiting for request)

    sock.ev.on('messaging-history.set', ({ chats: historyChats, contacts: historyContacts, isLatest }) => {
      if (historyChats?.length || historyContacts?.length) {
        log('WA', `History sync: ${historyChats?.length || 0} chats, ${historyContacts?.length || 0} contacts (isLatest: ${isLatest})`);
      }
      for (const contact of (historyContacts || [])) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      updateMappings(historyContacts || []);
      for (const chat of (historyChats || [])) {
        if (chat.id) {
          const old = chats.get(chat.id) || {};
          chats.set(chat.id, safeMerge(old, chat));
        }
      }
      saveCache();
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
      log('WA', `Contacts upsert: ${newContacts.length} contacts`);
      for (const contact of newContacts) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      updateMappings(newContacts);
      saveCache();
    });

    sock.ev.on('contacts.set', ({ contacts: newContacts }) => {
      if (!newContacts) return;
      log('WA', `Contacts set: ${newContacts.length} contacts`);
      for (const contact of newContacts) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, safeMerge(old, contact));
        }
      }
      updateMappings(newContacts);
      saveCache();
    });

    sock.ev.on('chats.set', ({ chats: newChats }) => {
      if (!newChats) return;
      log('WA', `Chats set: ${newChats.length} chats`);
      for (const chat of newChats) {
        if (chat.id) {
          const old = chats.get(chat.id) || {};
          chats.set(chat.id, safeMerge(old, chat));
        }
      }
      saveCache();
    });

    sock.ev.on('groups.upsert', (newGroups) => {
      for (const group of newGroups) {
        if (group.id) {
          const existing = chats.get(group.id) || {};
          chats.set(group.id, safeMerge(existing, { id: group.id, name: group.subject }));
        }
      }
      saveCache();
    });

    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          const existing = chats.get(update.id) || {};
          chats.set(update.id, { ...existing, id: update.id, name: update.subject });
        }
      }
      saveCache();
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = contacts.get(update.id) || {};
          contacts.set(update.id, safeMerge(old, update));
        }
      }
      updateMappings(updates);
      saveCache();
    });

    sock.ev.on('chats.upsert', (newChats) => {
      for (const chat of newChats) {
        if (chat.id) chats.set(chat.id, chat);
      }
      saveCache();
    });

    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = chats.get(update.id) || {};
          chats.set(update.id, safeMerge(old, update));
        }
      }
      saveCache();
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!pairingRequested) return; // Ignore QR if not explicitly requested
        const { method } = getSettings();
        if (method === 'qr') {
          pairingData = { type: 'qr', data: qr };
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
        clientReady = false;
        clientAuthenticated = false;
        broadcast('status', { connected: false, authenticated: false, reason });

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
            await rm(BAILEYS_DATA_DIR, { recursive: true, force: true });
            mkdirSync(BAILEYS_DATA_DIR, { recursive: true });
            chats.clear();
            contacts.clear();
            log('WA', 'Auth state and cache cleared. Will show QR/pairing code on reconnect.');
          } catch (e) {
            log('WA', 'Failed to clear auth state: ' + e.message);
          }
          reconnectAttempts = 0;
          lastPairingCodeRequest = 0;
          setTimeout(() => {
            start();
          }, 5000);
        } else {
          reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 60000);
          log('WA', `Temporary disconnect. Reconnecting in ${delay / 1000}s... (Attempt ${reconnectAttempts})`);
          setTimeout(() => {
            start();
          }, delay);
        }
      } else if (connection === 'open') {
        reconnectAttempts = 0;
        clientReady = true;
        clientAuthenticated = true;
        myId = jidNormalizedUser(sock.user.id);
        log('WA', `Ready — monitoring messages (logged in as: ${myId})`);
        broadcast('status', { connected: true, authenticated: true, id: myId });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const msg of messages) {
        try {
          await handleMessage(msg);
        } catch (e) {
          log('WA', 'Unhandled error in handleMessage: ' + e.message + '\n' + e.stack);
        }
      }
    });

    sock.ev.on('messages.update', async (events) => {
      for (const event of events) {
        await handleMessageUpdate(event);
      }
    });
  };

  async function downloadAndSaveMedia(messageContent, msg = null) {
    try {
      let mediaType = '';
      let fileExt = 'bin';
      let mType = getContentType(messageContent);
      const wrappers = ['ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];

      while (mType && wrappers.includes(mType)) {
        messageContent = extractMessageContent(messageContent);
        mType = getContentType(messageContent);
      }

      let mediaData = null;
      if (mType === 'imageMessage') { mediaType = 'image'; fileExt = 'jpeg'; mediaData = messageContent.imageMessage; }
      else if (mType === 'videoMessage') { mediaType = 'video'; fileExt = 'mp4'; mediaData = messageContent.videoMessage; }
      else if (mType === 'audioMessage') { mediaType = 'audio'; fileExt = 'ogg'; mediaData = messageContent.audioMessage; }
      else if (mType === 'stickerMessage') { mediaType = 'sticker'; fileExt = 'webp'; mediaData = messageContent.stickerMessage; }
      else if (mType === 'documentMessage') { mediaType = 'document'; fileExt = messageContent.documentMessage.mimetype?.split('/')[1]?.split(';')[0] || 'bin'; mediaData = messageContent.documentMessage; }

      if (!mediaType || !mediaData) {
        log('WA', `Download failed: Could not determine data container for type ${mType}`);
        return null;
      }

      // Handle deduplication by SHA256
      let sha256hex = null;
      if (mediaData.fileSha256) {
        sha256hex = Buffer.from(mediaData.fileSha256).toString('hex');
        const existing = db.getMediaBySha256(sha256hex);
        if (existing) {
          log('WA', `Reusing existing media for SHA256: ${sha256hex.slice(0, 8)}…`);
          return {
            mediaPath: existing.media_path,
            mediaType: existing.media_type,
            mediaFilename: existing.media_filename,
            mediaSha256: sha256hex,
            type: mediaType
          };
        }
      }

      // We use the entire message info for downloadMediaMessage if possible
      const buffer = await downloadMediaMessage(
        { message: messageContent, key: msg?.key },
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
      ).catch(err => {
        log('WA', `Download error: ${err.message}`);
        return null;
      });

      if (!buffer) {
        log('WA', `Download failed: returned empty for ${mediaType}`);
        return null;
      }

      const filename = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
      const filepath = join(MEDIA_DIR, filename);
      await writeFile(filepath, buffer);

      return {
        mediaPath: filename,
        mediaType: mediaData.mimetype || mediaType + '/' + fileExt,
        mediaFilename: mediaData.fileName || filename,
        mediaSha256: sha256hex,
        type: mediaType
      };
    } catch (e) {
      log('WA', 'Failed to download media: ' + e.message);
      return null;
    }
  }

  async function getChatName(jid, pushName = null) {
    if (!jid) return 'Unknown';

    let altJid = null;
    if (jid.includes('@lid')) {
      altJid = resolveToPNLocal(jid);
      if (altJid === jid) altJid = null;
    } else if (jid.includes('@s.whatsapp.net')) {
      altJid = resolveToLIDLocal(jid);
    }

    const contact = contacts.get(jid) || {};
    const chat = chats.get(jid) || {};
    const altContact = altJid ? (contacts.get(altJid) || {}) : {};
    const altChat = altJid ? (chats.get(altJid) || {}) : {};

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
    if (sock && isJidGroup(jid)) {
      try {
        const metadata = await sock.groupMetadata(jid);
        if (metadata?.subject) {
          chats.set(jid, { ...chat, id: jid, name: metadata.subject });
          return metadata.subject;
        }
      } catch (e) { }
    }

    return jid.split('@')[0];
  }

  async function getProfilePic(jid) {
    if (!jid || !sock) return null;
    let existing = db.getChatProfilePic(jid);
    if (existing) return existing;
    try {
      const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
      if (!url) return null;
      const filename = `dp_${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      const filepath = join(MEDIA_DIR, filename);
      const res = await fetch(url);
      if (!res.ok) return null;
      await writeFile(filepath, Buffer.from(await res.arrayBuffer()));
      db.updateChatProfilePic(jid, filename);
      return filename;
    } catch (e) { return null; }
  }

  function resolveToPNLocal(jid) {
    if (!jid || !jid.includes('@lid')) return jid;
    return lidToPn.get(jid) || jid;
  }

  async function resolveToPN(jid) {
    if (!jid) return jid;
    if (jid.includes('@g.us')) return jid;
    if (jid.includes('@s.whatsapp.net')) return jid;

    if (!jid.includes('@lid')) return jid;

    // 1. Check our fast cache
    const cached = lidToPn.get(jid);
    if (cached) return cached;

    // 2. Check Baileys' repository - BUT only if we are ready and not in a tight loop potentially
    if (sock?.signalRepository?.lidMapping) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) {
          const fullPn = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
          lidToPn.set(jid, fullPn);
          pnToLid.set(fullPn, jid);
          return fullPn;
        }
      } catch (e) { }
    }

    // 3. Fallback: search contacts for matching LID
    for (const [c_jid, c_info] of contacts.entries()) {
      if (c_info.lid && (c_info.lid === jid || c_info.lid.includes(jid.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        lidToPn.set(jid, c_jid);
        pnToLid.set(c_jid, jid);
        return c_jid;
      }
      if (c_jid === jid && c_info.phoneNumber) {
        const fullPn = c_info.phoneNumber + '@s.whatsapp.net';
        lidToPn.set(jid, fullPn);
        pnToLid.set(fullPn, jid);
        return fullPn;
      }
    }
    return jid;
  }

  function resolveToLIDLocal(jid) {
    if (!jid || !jid.includes('@s.whatsapp.net')) return null;
    return pnToLid.get(jid) || null;
  }

  async function resolveToLID(jid) {
    if (!jid || !jid.includes('@s.whatsapp.net')) return null;
    if (pnToLid.has(jid)) return pnToLid.get(jid);

    if (sock?.signalRepository?.lidMapping) {
      try {
        let lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
        if (lid) {
          if (!lid.includes('@lid')) lid += '@lid';
          pnToLid.set(jid, lid);
          lidToPn.set(lid, jid);
          return lid;
        }
      } catch (e) { }
    }

    // Fallback from contacts
    const contact = contacts.get(jid);
    if (contact?.lid) {
      let lid = contact.lid.includes('@lid') ? contact.lid : (contact.lid + '@lid');
      pnToLid.set(jid, lid);
      lidToPn.set(lid, jid);
      return lid;
    }

    return null;
  }

  async function checkIsMonitored(jid) {
    if (!jid) return false;
    if (db.isMonitored(jid)) return true;

    // If it's a LID, check its PN
    if (jid.includes('@lid')) {
      const pn = await resolveToPN(jid);
      if (pn !== jid && db.isMonitored(pn)) return true;
    }
    // If it's a PN, check its LID
    else if (jid.includes('@s.whatsapp.net')) {
      const lid = await resolveToLID(jid);
      if (lid && db.isMonitored(lid)) return true;
    }

    return false;
  }

  async function handleMessage(msg) {
    const rawChatId = msg.key?.remoteJid;
    if (!rawChatId || rawChatId === 'status@broadcast') return;

    // Normalize to Phone Number for single unified chat view
    const chatId = await resolveToPN(rawChatId);

    // Baileys sometimes delivers view-once messages as stubs with no .message
    // but with msg.key.isViewOnce = true. We catch and record those.
    if (!msg.message) {
      if (msg.key?.isViewOnce && chatId) {
        if (!(await checkIsMonitored(chatId))) return;
        log('WA', `📸 View-Once STUB detected from ${chatId} (no message body — Baileys limitation)`);

        const isGroup = isJidGroup(chatId);
        let senderId = isGroup ? (msg.key.participant || chatId) : chatId;
        if (isGroup && msg.key.participantAlt && senderId.includes('@lid')) {
          senderId = msg.key.participantAlt;
        } else if (!isGroup && msg.key.remoteJidAlt && senderId.includes('@lid')) {
          senderId = msg.key.remoteJidAlt;
        }
        senderId = await resolveToPN(senderId);
        const senderName = await getChatName(senderId, msg.pushName);
        const lid = rawChatId.includes('@lid') ? rawChatId : await resolveToLID(rawChatId);
        db.upsertChat(chatId, chatName, isGroup, lid);

        const msgData = {
          message_id: msg.key.id,
          chat_id: chatId,
          sender_id: senderId,
          sender_name: senderName,
          body: '👁️ View-Once media',
          type: 'chat',
          has_media: false,
          media_type: null,
          media_filename: null,
          media_path: null,
          media_sha256: null,
          timestamp: msg.messageTimestamp,
          is_from_me: msg.key.fromMe ? 1 : 0,
          is_deleted: 0,
          is_view_once: 1,
          original_id: msg.key.id,
          quoted_stanza_id: null,
          quoted_sender: null,
          quoted_preview: null,
        };

        db.saveMessage(msgData);
        log('WA', `View-Once stub saved: ${chatName} from ${senderName}`);

        broadcast('new_message', {
          ...msgData,
          chat_name: chatName,
          is_group: isGroup ? 1 : 0,
          profile_pic: db.getChatProfilePic(chatId),
        });
      }
      return;
    }

    const mType = getContentType(msg.message) || 'stub';
    log('WA', `Received [${mType}] from ${rawChatId} (normalized: ${chatId})`);

    // Automatically track new chats based on incoming messages
    if (!chats.has(chatId) && chatId) {
      chats.set(chatId, { id: chatId });
      saveCache();
    }

    if (!(await checkIsMonitored(chatId))) return;

    // Debug: log raw message keys for monitored chats to help diagnose view-once issues
    const rawKeys = Object.keys(msg.message || {});
    log('WA', `Processing monitored message [${mType}] from ${chatId}`);

    // Aggressive unwrapping for view-once/ephemeral/etc.
    let tempMsg = msg.message;
    let wrappers = ['ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
    let messageType = getContentType(tempMsg);
    let isViewOnce = false;

    // Handle senderKeyDistributionMessage + viewOnce combo (group messages)
    if (messageType === 'senderKeyDistributionMessage' && rawKeys.length > 1) {
      // The real content is in another key alongside the senderKeyDistributionMessage
      const realKey = rawKeys.find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
      if (realKey) {
        log('WA', `Skipping senderKeyDistribution, real content: ${realKey}`);
        tempMsg = { [realKey]: tempMsg[realKey] };
        messageType = realKey;
      }
    }

    while (messageType && wrappers.includes(messageType)) {
      if (messageType.includes('viewOnce')) isViewOnce = true;
      log('WA', `Unwrapping ${messageType} from ${chatId}...`);
      tempMsg = extractMessageContent(tempMsg);
      messageType = getContentType(tempMsg);
    }

    // Secondary view-once detection on the inner content
    if (tempMsg && messageType && tempMsg[messageType]?.viewOnce) {
      isViewOnce = true;
    }

    if (isViewOnce) {
      log('WA', `Confirmed View-Once message (${messageType}) from ${chatId}`);
    }

    // Assign back the unwrapped message
    msg.message = tempMsg;

    if (!messageType) {
      if (isViewOnce) log('WA', `Abort: No unwrapped messageType for View-Once`);
      return;
    }

    let content = msg.message[messageType];

    if (messageType === 'protocolMessage') {
      if (content.type === 0 || content.type === 'REVOKE') {
        await handleRevoke(msg.key, content.key);
      }
      return;
    }

    // Handle reaction messages — update the original message with the reaction
    if (messageType === 'reactionMessage') {
      const reaction = content;
      const targetKey = reaction.key; // the message being reacted to
      if (!targetKey?.id) return;

      const targetId = targetKey.id;
      const emoji = reaction.text || ''; // empty string = reaction removed

      const isGroup = isJidGroup(chatId);
      let senderId = isGroup ? (msg.key.participant || chatId) : chatId;
      if (isGroup && msg.key.participantAlt && senderId.includes('@lid')) {
        senderId = msg.key.participantAlt;
      } else if (!isGroup && msg.key.remoteJidAlt && senderId.includes('@lid')) {
        senderId = msg.key.remoteJidAlt;
      }
      senderId = await resolveToPN(senderId);
      const senderName = await getChatName(senderId, msg.pushName);

      db.addReaction(targetId, senderId, senderName, emoji);
      broadcast('message_reaction', {
        chat_id: chatId,
        message_id: targetId,
        sender_id: senderId,
        sender_name: senderName,
        emoji: emoji,
      });
      return;
    }

    const isGroup = isJidGroup(chatId);
    let senderId = isGroup ? (msg.key.participant || chatId) : chatId;

    if (isGroup && msg.key.participantAlt && senderId.includes('@lid')) {
      senderId = msg.key.participantAlt;
    } else if (!isGroup && msg.key.remoteJidAlt && senderId.includes('@lid')) {
      senderId = msg.key.remoteJidAlt;
    }

    senderId = await resolveToPN(senderId);

    let senderName = await getChatName(senderId, msg.pushName);
    let chatName = await getChatName(chatId);
    const lid = rawChatId.includes('@lid') ? rawChatId : await resolveToLID(rawChatId);

    db.upsertChat(chatId, chatName, isGroup, lid);
    getProfilePic(chatId); // prefetch

    let body = '';
    if (messageType === 'conversation') body = msg.message.conversation;
    else if (messageType === 'extendedTextMessage') body = content.text;
    else if (content && content.caption) body = content.caption;

    const contextInfo = content?.contextInfo || msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo;
    let quotedStanzaId = null;
    let quotedSender = null;
    let quotedPreview = null;
    let quotedViewOnceMedia = null;

    if (contextInfo && contextInfo.quotedMessage) {
      quotedStanzaId = contextInfo.stanzaId || null;
      // Resolve quoted sender JID to a readable name
      const rawQuotedSender = contextInfo.participant || null;
      if (rawQuotedSender) {
        quotedSender = await getChatName(rawQuotedSender);
      }

      // Check if the quoted message contains view-once media
      const quotedStr = JSON.stringify(contextInfo.quotedMessage);
      const quotedIsViewOnce = quotedStr.includes('viewOnce') || quotedStr.includes('viewOnceMessage');

      // Try to extract the actual quoted content (unwrap viewOnce wrappers)
      let qMsg = extractMessageContent(contextInfo.quotedMessage);
      const qMsgType = getContentType(qMsg);
      const qContent = qMsg ? qMsg[qMsgType] : null;

      let preview = '';
      if (qMsgType === 'conversation') preview = qMsg.conversation;
      else if (qMsgType === 'extendedTextMessage') preview = qContent?.text;
      else if (qContent?.caption) preview = qContent.caption;
      else preview = '[' + (qMsgType || 'message').replace('Message', '') + ']';

      if (quotedIsViewOnce || qContent?.viewOnce) {
        preview = '👁️ (View Once) ' + preview;

        // Try to download the quoted view-once media
        const quotedMediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        if (qMsgType && quotedMediaTypes.includes(qMsgType) && qContent) {
          log('WA', `Attempting to download quoted view-once ${qMsgType}...`);
          try {
            quotedViewOnceMedia = await downloadAndSaveMedia(qMsg, { key: { remoteJid: chatId, id: quotedStanzaId, participant: rawQuotedSender } });
            if (quotedViewOnceMedia) {
              log('WA', `Successfully saved quoted view-once media: ${quotedViewOnceMedia.mediaPath}`);
            }
          } catch (e) {
            log('WA', `Failed to download quoted view-once media: ${e.message}`);
          }
        }
      }

      quotedPreview = preview.slice(0, 100);
    }

    let mediaData = null;
    let hasMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(messageType);
    if (hasMedia) {
      mediaData = await downloadAndSaveMedia(msg.message, msg);
    }

    // If this is a reply to a view-once message and we downloaded the quoted media, use it
    if (!mediaData && quotedViewOnceMedia) {
      mediaData = quotedViewOnceMedia;
      hasMedia = true;
    }

    const originalId = msg.key.id;

    const msgData = {
      message_id: msg.key.id,
      chat_id: chatId,
      sender_id: senderId,
      sender_name: senderName,
      body,
      type: mediaData ? mediaData.type : 'chat',
      has_media: !!mediaData,
      media_type: mediaData ? mediaData.mediaType : null,
      media_filename: mediaData ? mediaData.mediaFilename : null,
      media_path: mediaData ? mediaData.mediaPath : null,
      media_sha256: mediaData ? mediaData.mediaSha256 : null,
      timestamp: msg.messageTimestamp,
      is_from_me: msg.key.fromMe ? 1 : 0,
      is_deleted: 0,
      is_view_once: isViewOnce ? 1 : 0,
      original_id: originalId,
      quoted_stanza_id: quotedStanzaId,
      quoted_sender: quotedSender,
      quoted_preview: quotedPreview,
    };

    db.saveMessage(msgData);
    if (isViewOnce) log('WA', `Message cached: ${msgData.type} (view-once) in ${chatName} from ${senderName}`);

    broadcast('new_message', {
      ...msgData,
      chat_name: chatName,
      is_group: isGroup ? 1 : 0,
      profile_pic: db.getChatProfilePic(chatId), // Could be populated sync since prefetch
    });

    if (isViewOnce && notifyWhatsApp && myId && !msgData.is_from_me) {
      sendViewOnceNotification(msgData, chatName);
    }
  }

  async function sendViewOnceNotification(msg, chatName) {
    try {
      if (!sock || !myId) return;

      const from = msg.sender_name || 'Unknown';
      const mType = msg.type ? msg.type.toUpperCase() : 'MEDIA';
      const text = `👁️ *View-Once* from *${from}* (${chatName}) [${mType}]`;

      if (msg.has_media && msg.media_path) {
        const fullPath = join(MEDIA_DIR, msg.media_path);
        if (existsSync(fullPath)) {
          const content = { caption: text };
          if (msg.type === 'image') content.image = { url: fullPath };
          else if (msg.type === 'video') content.video = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await sock.sendMessage(myId, content);
          log('WA', `Sent view-once notification for ${msg.message_id}`);
        }
      }
    } catch (err) {
      log('WA', `Failed to send view-once notification: ` + err.message);
    }
  }

  async function handleMessageUpdate(event) {
    if (event.update?.message?.protocolMessage?.type === 0 || event.update?.message?.protocolMessage?.type === 'REVOKE') {
      await handleRevoke(event.key, event.update.message.protocolMessage.key);
    }
  }

  async function handleRevoke(currentKey, revokedKey) {
    const chatId = currentKey.remoteJid;
    if (!(await checkIsMonitored(chatId))) return;

    const revokeId = currentKey.id;
    const origId = revokedKey?.id;

    let messageId = origId || revokeId;

    let cached = db.getMessage(messageId) || db.getMessage(revokeId) || (origId ? db.getMessageByOriginalId(origId) : null);
    if (cached) messageId = cached.message_id;

    db.markDeleted(messageId);
    if (origId && origId !== revokeId) db.markDeleted(revokeId);

    const deleted = db.getMessage(messageId);
    if (deleted) {
      const chat = db.getChat(deleted.chat_id);
      const chatName = chat?.name || deleted.chat_id;

      log('WA', `Message deleted in ${chatName} by ${deleted.sender_name || 'unknown'}`);
      broadcast('message_deleted', {
        ...deleted,
        chatName,
        isGroup: chat?.is_group || 0,
      });

      if (notifyWhatsApp && myId && !deleted.is_from_me) {
        sendDeletionNotification(deleted, chatName);
      }
    }
  }

  async function sendDeletionNotification(msg, chatName) {
    try {
      if (!sock || !myId) return;

      const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const from = msg.sender_name || 'Unknown';
      const mType = msg.type !== 'chat' && msg.type ? ` [${msg.type.toUpperCase()}]` : '';

      const text = [
        `🗑️ *Deleted* from *${from}* (${chatName}) at ${time}${mType}:`,
        msg.body ? `> ${msg.body}` : (msg.has_media ? '' : '_No text content_')
      ].filter(r => r !== '').join('\n');

      if (msg.has_media && msg.media_path) {
        const fullPath = join(MEDIA_DIR, msg.media_path);
        if (existsSync(fullPath)) {
          const mediaType = msg.type;
          const content = { caption: text };

          if (mediaType === 'image') content.image = { url: fullPath };
          else if (mediaType === 'video') content.video = { url: fullPath };
          else if (mediaType === 'audio') {
            content.audio = { url: fullPath };
            content.mimetype = 'audio/ogg; codecs=opus';
            content.ptt = true;
          }
          else if (mediaType === 'sticker') content.sticker = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await sock.sendMessage(myId, content);
          log('WA', `Sent media deletion notification for ${msg.message_id}`);
          return;
        }
      }

      await sock.sendMessage(myId, { text });
      log('WA', `Sent deletion notification for ${msg.message_id}`);
    } catch (err) {
      log('WA', `Failed to send deletion notification: ` + err.message);
    }
  }

  async function expandMonitoredSetWithMappings(monitoredSet) {
    if (!sock?.signalRepository?.lidMapping) return;

    await Promise.all(Array.from(monitoredSet).map(async (jid) => {
      try {
        if (jid.includes('@lid')) {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) monitoredSet.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (jid.includes('@s.whatsapp.net')) {
          const lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
          if (lid) monitoredSet.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e) { }
    }));
  }

  async function getWhatsAppChats() {
    if (!clientReady) return [];
    try {
      if (clientReady && sock) {
        try {
          const allGroups = await sock.groupFetchAllParticipating();
          for (const [id, group] of Object.entries(allGroups)) {
            if (!chats.has(id)) {
              chats.set(id, { id, name: group.subject });
            }
          }
        } catch (e) {
          log('WA', 'Failed to fetch all participating groups: ' + e.message);
        }
      }

      // Merge contacts into chats map so private contacts show up too
      const resolvedIds = new Map(); // Cache LID to PN mapping for this loop
      const blockedDomains = ['@g.us', '@broadcast', '@newsletter'];

      for (const [id, contact] of contacts.entries()) {
        if (!id || blockedDomains.some(domain => id.endsWith(domain))) continue;

        let preferredName = contact.name || contact.verifiedName || contact.notify || contact.pushname || '';

        // Try mapping LID to its phone contact name
        if (!preferredName && id.includes('@lid') && contact.phoneNumber) {
          const pnInfo = contacts.get(contact.phoneNumber + '@s.whatsapp.net') || contacts.get(contact.phoneNumber);
          if (pnInfo) {
            preferredName = pnInfo.name || pnInfo.verifiedName || pnInfo.notify || pnInfo.pushname || '';
          }
        }

        // Use the common mapping logic
        let targetId = id;
        if (id.includes('@lid') && sock?.signalRepository?.lidMapping) {
          try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(id);
            if (pn) {
              targetId = pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net';
              resolvedIds.set(id, targetId);
            }
          } catch (e) { }
        }

        if (!chats.has(targetId)) {
          chats.set(targetId, { id: targetId, name: preferredName });
        } else {
          const c = chats.get(targetId);
          if (preferredName && (!c.name || c.name === targetId.split('@')[0] || c.name.includes(targetId.split('@')[0]))) {
            chats.set(targetId, { ...c, name: preferredName });
          }
        }
      }

      const dedupedMap = new Map();
      const chatBlockedDomains = ['@broadcast', '@newsletter'];

      for (const [id, c] of chats.entries()) {
        if (!id || chatBlockedDomains.some(domain => id.endsWith(domain))) continue;

        let baseId = id;
        if (id.includes('@lid')) {
          baseId = resolveToPNLocal(id);
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
          const m_lid = resolveToLIDLocal(baseId);
          if (m_lid && !existing.lids.includes(m_lid)) {
            existing.lids.push(m_lid.split('@')[0]);
          }
        }

        // --- MERGE FIX: Ensure we move the LID to the PN entry permanently ---
        if (id !== baseId) {
          chats.delete(id);
        }

        // If c has conversationTimestamp and existing doesn't or existing's is older, update it
        let cTs = c.conversationTimestamp?.low || c.conversationTimestamp || 0;
        let eTs = existing.conversationTimestamp?.low || existing.conversationTimestamp || 0;
        if (cTs > eTs) existing.conversationTimestamp = cTs;

        dedupedMap.set(baseId, existing);
      }

      const allChats = Array.from(dedupedMap.values());
      const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));

      // Batch fetch profile pics for all chats to avoid N+1 queries during mapping
      const profilePics = db.getChatProfilePics(allChats.map(c => c.id));

      // Expand monitored set with mapped LIDs and PNs so UI reflects status correctly for both formats
      await expandMonitoredSetWithMappings(monitored);

      log('WA', `Available chats: ${allChats.length} (contacts: ${contacts.size}, chats: ${chats.size})`);

      const results = await Promise.all(allChats
        .map(async c => {
          const isGroup = isJidGroup(c.id);
          let name = c.name || c.notify || '';

          if (!name || name === c.id.split('@')[0]) {
            name = await getChatName(c.id);
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
      Promise.all(monitoredChatsToFetch.map(c => getProfilePic(c.id))).catch(() => { });

      return results.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      log('WA', 'Error getting chats: ' + e.message);
      return [];
    }
  }

  async function deleteChatFully(chatId) {
    // Collect all related IDs (LIDs + PNs) so we can thoroughly purge from DB
    const relatedIds = new Set([chatId]);

    // Check mapping caches first
    if (chatId.includes('@lid')) {
      const pn = resolveToPNLocal(chatId);
      if (pn !== chatId) relatedIds.add(pn);
    } else {
      const lid = resolveToLIDLocal(chatId);
      if (lid) relatedIds.add(lid);
    }

    // Check Baileys' repository as fallback
    if (sock?.signalRepository?.lidMapping) {
      try {
        if (chatId.includes('@lid')) {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(chatId);
          if (pn) relatedIds.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (chatId.includes('@s.whatsapp.net')) {
          const lid = await sock.signalRepository.lidMapping.getLIDForPN(chatId);
          if (lid) relatedIds.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e) { }
    }

    // Fallbacks from contacts
    for (const [c_jid, c_info] of contacts.entries()) {
      if (chatId.includes('@lid') && c_info.lid && (c_info.lid === chatId || c_info.lid.includes(chatId.split('@')[0])) && c_jid.includes('@s.whatsapp.net')) {
        relatedIds.add(c_jid);
      }
      if (c_jid === chatId && c_info.phoneNumber) {
        relatedIds.add(c_info.phoneNumber + '@s.whatsapp.net');
      }
    }

    const ids = Array.from(relatedIds);
    log('WA', `Purging local data for IDs: ${ids.join(', ')}`);

    const { deleteChatsAndMessages, removeMonitoredChat } = db;

    if (ids.length > 0) {
      await deleteChatsAndMessages(ids);
      for (const id of ids) {
        removeMonitoredChat(id);
      }
    }
  }

  return {
    client: sock,
    start,
    isReady: () => clientReady,
    isAuthenticated: () => clientAuthenticated,
    getMyId: () => myId,
    getWhatsAppChats,
    deleteChatFully,
    getNotifyEnabled: () => notifyWhatsApp,
    getPairingStatus: () => ({
      ...pairingData,
      connected: clientReady,
      authenticated: !!(sock?.authState?.creds?.registered || clientAuthenticated)
    }),
    resetWhatsAppSession,
    setNotifyEnabled: (enabled) => {
      notifyWhatsApp = !!enabled;
      log('WA', `Notification forwarding ${notifyWhatsApp ? 'enabled' : 'disabled'}`);
    },
  };
}
