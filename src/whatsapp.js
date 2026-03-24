import makeWASocket, { DisconnectReason, useMultiFileAuthState, downloadMediaMessage, getContentType, jidNormalizedUser, isJidGroup, extractMessageContent } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MEDIA_DIR } from './database.js';
import { log } from './logger.js';
import pino from 'pino';
import WS from 'ws';

// Patch ws to suppress Bun warnings for unimplemented events
const originalOn = WS.prototype.on;
WS.prototype.on = function (event, listener) {
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

export function createMonitor(db, broadcast) {
  let sock = null;
  let clientReady = false;
  let clientAuthenticated = false;
  let myId = null;
  let pairingData = { type: null, data: null };
  let reconnectAttempts = 0;
  let lastPairingCodeRequest = 0;

  const getSettings = () => {
    const s = db.getSettings();
    return {
      phone: s.whatsapp_phone || '',
      notify: s.whatsapp_notify === 'true',
      method: s.whatsapp_pairing_method || 'code' // 'code' or 'qr'
    };
  };

  let { notify: notifyWhatsApp } = getSettings();

  const resetWhatsAppSession = async () => {
    log('WA', 'Manual reset requested. Clearing auth and restarting...');
    if (sock) {
      try { await sock.logout(); } catch (e) { }
      sock.end();
    }
    await deleteDirRecursive(BAILEYS_DATA_DIR);
    mkdirSync(BAILEYS_DATA_DIR, { recursive: true });
    pairingData = { type: null, data: null };
    chats.clear();
    contacts.clear();
    reconnectAttempts = 0;
    lastPairingCodeRequest = 0;
    // Start fresh: will re-read settings internally
    setTimeout(start, 2000);
  };

  // Only update simple preferences live, NO auto-restarts for phone/method
  setInterval(() => {
    const s = getSettings();
    notifyWhatsApp = s.notify;
  }, 10000);

  const contacts = new Map();
  const chats = new Map();

  const CACHE_FILE = join(BAILEYS_DATA_DIR, 'store_cache.json');
  try {
    if (existsSync(CACHE_FILE)) {
      const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      if (cache.contacts) cache.contacts.forEach(c => contacts.set(c.id, c));
      if (cache.chats) cache.chats.forEach(c => chats.set(c.id, c));
      log('WA', `Restored ${contacts.size} contacts and ${chats.size} chats from cache`);
    }
  } catch (e) {
    log('WA', 'Failed to restore store cache: ' + e.message);
  }

  let saveTimer = null;
  function saveCache() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      try {
        const data = {
          contacts: Array.from(contacts.values()),
          chats: Array.from(chats.values())
        };
        writeFileSync(CACHE_FILE, JSON.stringify(data));
      } catch (e) {
        log('WA', 'Failed to save store cache: ' + e.message);
      }
      saveTimer = null;
    }, 10000);
  }

  const start = async () => {
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

    sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      syncFullHistory: true,
      browser: ['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    const { phone: phoneNumber, method: pairingMethod } = getSettings();

    if (phoneNumber && pairingMethod === 'code' && !sock.authState.creds.registered) {
      const now = Date.now();
      if (now - lastPairingCodeRequest > 60000) {
        setTimeout(async () => {
          try {
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

    sock.ev.on('messaging-history.set', ({ chats: historyChats, contacts: historyContacts, isLatest }) => {
      log('WA', `History sync: ${historyChats?.length || 0} chats, ${historyContacts?.length || 0} contacts (isLatest: ${isLatest})`);
      for (const contact of (historyContacts || [])) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, { ...old, ...contact });
        }
      }
      for (const chat of (historyChats || [])) {
        if (chat.id) {
          const old = chats.get(chat.id) || {};
          chats.set(chat.id, { ...old, ...chat });
        }
      }
      saveCache();
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
      log('WA', `Contacts upsert: ${newContacts.length} contacts`);
      for (const contact of newContacts) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, { ...old, ...contact });
        }
      }
      saveCache();
    });

    sock.ev.on('contacts.set', ({ contacts: newContacts }) => {
      if (!newContacts) return;
      log('WA', `Contacts set: ${newContacts.length} contacts`);
      for (const contact of newContacts) {
        if (contact.id) {
          const old = contacts.get(contact.id) || {};
          contacts.set(contact.id, { ...old, ...contact });
        }
      }
      saveCache();
    });

    sock.ev.on('chats.set', ({ chats: newChats }) => {
      if (!newChats) return;
      log('WA', `Chats set: ${newChats.length} chats`);
      for (const chat of newChats) {
        if (chat.id) {
          const old = chats.get(chat.id) || {};
          chats.set(chat.id, { ...old, ...chat });
        }
      }
      saveCache();
    });

    sock.ev.on('groups.upsert', (newGroups) => {
      for (const group of newGroups) {
        if (group.id) {
          const existing = chats.get(group.id) || {};
          chats.set(group.id, { ...existing, id: group.id, name: group.subject || existing.name });
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
          contacts.set(update.id, { ...old, ...update });
        }
      }
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
          chats.set(update.id, { ...old, ...update });
        }
      }
      saveCache();
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const { method } = getSettings();
        if (method === 'qr') {
          pairingData = { type: 'qr', data: qr };
          log('WA', 'QR Code generated');
          console.log('\n========================================');
          qrcode.generate(qr, { small: true });
          console.log('========================================\n');
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';
        log('WA', `Connection closed: ${reason} (code: ${statusCode})`);
        clientReady = false;
        clientAuthenticated = false;
        broadcast('status', { connected: false, authenticated: false, reason });

        const isRegistered = sock?.authState?.creds?.registered;

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
          setTimeout(start, 5000);
        } else {
          reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 60000);
          log('WA', `Temporary disconnect. Reconnecting in ${delay/1000}s... (Attempt ${reconnectAttempts})`);
          setTimeout(start, delay);
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

    // 1. Phone-saved contact name (highest priority — user's own addressbook)
    const contactInfo = contacts.get(jid);
    if (contactInfo?.name) return contactInfo.name;

    // 2. Verified Business Name
    if (contactInfo?.verifiedName) return contactInfo.verifiedName;

    // 3. Push name from message (real-time name from WhatsApp)
    if (pushName) return pushName;

    // 4. WhatsApp push/notify names from sync
    if (contactInfo?.notify) return contactInfo.notify;
    if (contactInfo?.pushname) return contactInfo.pushname;

    // 4.5. Recursive lookup for LID to PN (Phone Number) mapping
    if (jid.includes('@lid')) {
      // First, check if any contact in our map has this LID linked to its phone number
      for (const contact of contacts.values()) {
        if (contact.lid === jid || contact.id === jid) {
          const name = contact.name || contact.verifiedName || contact.notify || contact.pushname;
          if (name && name !== jid.split('@')[0]) return name;
          // If the contact ID is a phone number, it's better than the LID
          if (contact.id.includes('@s.whatsapp.net')) return contact.id.split('@')[0];
        }
      }

      // Also check contactInfo in case it has its own PN linked
      if (contactInfo?.phoneNumber && contactInfo.phoneNumber !== jid) {
        const mappedName = await getChatName(contactInfo.phoneNumber, pushName);
        if (mappedName && !mappedName.includes('@')) {
          // We found a name or at least a phone number — use it!
          return mappedName;
        }
        // Fallback to the phone number itself if the name search didn't yield a result
        return contactInfo.phoneNumber.split('@')[0];
      }
    }

    // 5. Chat name (group subject or synced name)
    const chatInfo = chats.get(jid);
    if (chatInfo?.name && !chatInfo.name.includes(jid.split('@')[0])) {
      return chatInfo.name;
    }
    if (chatInfo?.notify) return chatInfo.notify;

    // 5. Dynamic fallback for groups
    if (sock && isJidGroup(jid)) {
      try {
        const metadata = await sock.groupMetadata(jid);
        if (metadata && metadata.subject) {
          chats.set(jid, { ...(chats.get(jid) || {}), id: jid, name: metadata.subject });
          return metadata.subject;
        }
      } catch (e) { }
    }

    // 6. Fallback to fetch real phone number for LIDs
    if (sock?.signalRepository?.lidMapping && jid.includes('@lid')) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) {
          const mappedName = await getChatName(pn, pushName);
          if (mappedName && mappedName !== pn.split('@')[0]) return mappedName;
          return pn.split('@')[0];
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

  async function handleMessage(msg) {
    const chatId = msg.key?.remoteJid;
    if (!chatId || chatId === 'status@broadcast') return;

    // Baileys sometimes delivers view-once messages as stubs with no .message
    // but with msg.key.isViewOnce = true. We catch and record those.
    if (!msg.message) {
      if (msg.key?.isViewOnce && chatId) {
        if (!db.isMonitored(chatId)) return;
        log('WA', `📸 View-Once STUB detected from ${chatId} (no message body — Baileys limitation)`);

        const isGroup = isJidGroup(chatId);
        let senderId = isGroup ? (msg.key.participant || chatId) : chatId;
        if (isGroup && msg.key.participantAlt && senderId.includes('@lid')) {
          senderId = msg.key.participantAlt;
        } else if (!isGroup && msg.key.remoteJidAlt && senderId.includes('@lid')) {
          senderId = msg.key.remoteJidAlt;
        }
        const senderName = await getChatName(senderId, msg.pushName);
        const chatName = await getChatName(chatId);

        db.upsertChat(chatId, chatName, isGroup);

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

    // Automatically track new chats based on incoming messages
    if (!chats.has(chatId) && chatId) {
      chats.set(chatId, { id: chatId });
      saveCache();
    }

    if (!db.isMonitored(chatId)) return;

    // Debug: log raw message keys for monitored chats to help diagnose view-once issues
    const rawKeys = Object.keys(msg.message);
    const rawType = getContentType(msg.message);
    log('WA', `Incoming [${rawType}] keys=[${rawKeys.join(',')}] from ${chatId}`);

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

    let senderName = await getChatName(senderId, msg.pushName);
    let chatName = await getChatName(chatId);

    db.upsertChat(chatId, chatName, isGroup);
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
  }

  async function handleMessageUpdate(event) {
    if (event.update?.message?.protocolMessage?.type === 0 || event.update?.message?.protocolMessage?.type === 'REVOKE') {
      await handleRevoke(event.key, event.update.message.protocolMessage.key);
    }
  }

  async function handleRevoke(currentKey, revokedKey) {
    const chatId = currentKey.remoteJid;
    if (!db.isMonitored(chatId)) return;

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
      const time = new Date(msg.timestamp * 1000).toLocaleString();
      const now = new Date().toLocaleString();
      const mediaTag = msg.has_media ? `\n*Type:* ${msg.type}` : '';

      const text = [
        `🗑️ *Deleted Message Detected*`,
        ``,
        `*From:* ${msg.sender_name || 'Unknown'}`,
        `*Chat:* ${chatName}`,
        `*Sent:* ${time}`,
        `*Deleted at:* ${now}`,
        mediaTag,
        ``,
        msg.body ? `*Original message:*\n${msg.body}` : '_No text content_',
        ``,
        msg.has_media ? '_Media was saved. View it on your dashboard._' : '',
      ].filter(Boolean).join('\n');

      if (sock && myId) {
        await sock.sendMessage(myId, { text });
        log('WA', `Deletion notification sent to self`);
      }
    } catch (err) {
      log('WA', `Failed to send deletion notification: ` + err.message);
    }
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
      for (const [id, contact] of contacts.entries()) {
        if (!id || id.endsWith('@g.us') || id === 'status@broadcast' || id.endsWith('@broadcast') || id.endsWith('@newsletter')) continue;

        let preferredName = contact.name || contact.verifiedName || contact.notify || contact.pushname || '';

        // Try mapping LID to its phone contact name
        if (!preferredName && id.includes('@lid') && contact.phoneNumber) {
          const pnInfo = contacts.get(contact.phoneNumber);
          if (pnInfo) {
            preferredName = pnInfo.name || pnInfo.verifiedName || pnInfo.notify || pnInfo.pushname || '';
          }
        }
        if (!chats.has(id)) {
          chats.set(id, { id, name: preferredName });
        } else {
          const c = chats.get(id);
          // Overwrite raw ID chat names with the meaningful contact name or pushname
          if (preferredName && (!c.name || c.name === id.split('@')[0] || c.name.includes(id.split('@')[0]))) {
            chats.set(id, { ...c, name: preferredName });
          } else if (preferredName && c.name && !contact.name) {
            // If they are unsaved, but we have a notify, use the notify instead of potential raw IDs
            chats.set(id, { ...c, name: preferredName });
          }
        }
      }

      const allChats = Array.from(chats.values());
      const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));

      log('WA', `Available chats: ${allChats.length} (contacts: ${contacts.size}, chats: ${chats.size})`);

      const results = await Promise.all(allChats
        .filter(c => c.id !== 'status@broadcast')
        .map(async c => {
          const isGroup = isJidGroup(c.id);
          let name = c.name || c.notify || '';

          // If the name is missing or is just a naked LID/ID, try a full resolution
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
            profilePic: db.getChatProfilePic(c.id) || null
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

  return {
    client: sock,
    start,
    isReady: () => clientReady,
    isAuthenticated: () => clientAuthenticated,
    getMyId: () => myId,
    getWhatsAppChats,
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
