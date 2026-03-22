import makeWASocket, { DisconnectReason, useMultiFileAuthState, downloadContentFromMessage, getContentType, jidNormalizedUser, isJidGroup, extractMessageContent } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MEDIA_DIR } from './database.js';
import pino from 'pino';

// Ensure data dirs
const BAILEYS_DATA_DIR = './data/baileys_auth';
if (!existsSync(BAILEYS_DATA_DIR)) mkdirSync(BAILEYS_DATA_DIR, { recursive: true });

function log(category, message, ...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('[' + ts + '] [' + category + '] ' + message, ...args);
}

export function createMonitor(db, broadcast) {
  let sock = null;
  let clientReady = false;
  let clientAuthenticated = false;
  let myId = null;
  let notifyWhatsApp = process.env.NOTIFY_WHATSAPP === 'true';

  const contacts = new Map();
  const chats = new Map();

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
      syncFullHistory: false,
      browser: ['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    const phoneNumber = process.env.WHATSAPP_PHONE;
    if (phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(formattedPhone);
          const readableCode = code?.match(/.{1,4}/g)?.join('-') || code;
          log('WA', `📱 Phone pairing requested for ${formattedPhone}. Follow instructions:`);
          console.log('\n========================================');
          console.log(` ENTER THIS PAIRING CODE IN WHATSAPP: ${readableCode} `);
          console.log('========================================\n');
        } catch (err) {
          log('WA', 'Failed to request pairing code: ' + err.message);
        }
      }, 3000);
    }

    sock.ev.on('messaging-history.set', ({ chats: historyChats, contacts: historyContacts }) => {
      for (const contact of historyContacts) {
        if (contact.id) contacts.set(contact.id, contact);
      }
      for (const chat of historyChats) {
        if (chat.id) chats.set(chat.id, chat);
      }
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
      for (const contact of newContacts) {
        if (contact.id) contacts.set(contact.id, contact);
      }
    });

    sock.ev.on('groups.upsert', (newGroups) => {
      for (const group of newGroups) {
        if (group.id) {
          const existing = chats.get(group.id) || {};
          chats.set(group.id, { ...existing, id: group.id, name: group.subject || existing.name });
        }
      }
    });

    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          const existing = chats.get(update.id) || {};
          chats.set(update.id, { ...existing, id: update.id, name: update.subject });
        }
      }
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = contacts.get(update.id) || {};
          contacts.set(update.id, { ...old, ...update });
        }
      }
    });

    sock.ev.on('chats.upsert', (newChats) => {
      for (const chat of newChats) {
        if (chat.id) chats.set(chat.id, chat);
      }
    });

    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const old = chats.get(update.id) || {};
          chats.set(update.id, { ...old, ...update });
        }
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log('WA', 'QR code generated scan to authenticate');
        console.log('\n========================================');
        qrcode.generate(qr, { small: true });
        console.log('========================================\n');
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        log('WA', 'Connection closed: ' + lastDisconnect?.error + ', reconnecting: ' + shouldReconnect);
        console.error('Connection close details:', lastDisconnect?.error);
        clientReady = false;
        clientAuthenticated = false;
        broadcast('status', { connected: false, authenticated: false, reason: lastDisconnect?.error?.message });
        if (shouldReconnect) {
          setTimeout(start, 3000);
        } else {
          broadcast('status', { connected: false, authenticated: false, reason: 'Logged out' });
        }
      } else if (connection === 'open') {
        clientReady = true;
        clientAuthenticated = true;
        myId = jidNormalizedUser(sock.user.id);
        log('WA', `Ready — monitoring messages (logged in as: ${myId})`);
        broadcast('status', { connected: true, authenticated: true, id: myId });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await handleMessage(msg);
      }
    });

    sock.ev.on('messages.update', async (events) => {
      for (const event of events) {
        await handleMessageUpdate(event);
      }
    });
  };

  async function downloadAndSaveMedia(messageContent) {
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

      if (!mediaType || !mediaData) return null;

      const stream = await downloadContentFromMessage(mediaData, mediaType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

      const filename = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
      const filepath = join(MEDIA_DIR, filename);
      await writeFile(filepath, buffer);

      return {
        mediaPath: filename,
        mediaType: mediaData.mimetype || mediaType + '/' + fileExt,
        mediaFilename: mediaData.fileName || filename,
        type: mediaType
      };
    } catch (e) {
      log('WA', 'Failed to download media: ' + e.message);
      return null;
    }
  }

  async function getChatName(jid, pushName = null) {
    if (!jid) return 'Unknown';
    if (pushName) return pushName;
    const chatInfo = chats.get(jid);
    if (chatInfo?.name) return chatInfo.name;
    const contactInfo = contacts.get(jid);
    if (contactInfo?.name) return contactInfo.name;
    if (contactInfo?.notify) return contactInfo.notify;

    // Dynamic fallback for unidentified groups
    if (sock && isJidGroup(jid)) {
      try {
        const metadata = await sock.groupMetadata(jid);
        if (metadata && metadata.subject) {
          chats.set(jid, { ...(chats.get(jid) || {}), id: jid, name: metadata.subject });
          return metadata.subject;
        }
      } catch (e) { }
    }

    // Fallback to fetch real phone number for LIDs
    if (sock?.signalRepository?.lidMapping && jid.includes('@lid')) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
        if (pn) return pn.split('@')[0];
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
    if (!msg.message) return;
    const chatId = msg.key.remoteJid;
    if (!chatId || chatId === 'status@broadcast') return;

    // Automatically track new chats based on incoming messages
    if (!chats.has(chatId) && chatId) {
      chats.set(chatId, { id: chatId });
    }

    if (!db.isMonitored(chatId)) return;

    let isViewOnce = JSON.stringify(msg.message).includes('viewOnce');

    let messageType = getContentType(msg.message);
    const wrappers = ['ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];

    while (messageType && wrappers.includes(messageType)) {
      if (messageType.includes('viewOnce')) isViewOnce = true;
      msg.message = extractMessageContent(msg.message);
      messageType = getContentType(msg.message);
    }

    if (!messageType) return;

    let content = msg.message[messageType];

    if (messageType === 'protocolMessage') {
      if (content.type === 0 || content.type === 'REVOKE') {
        await handleRevoke(msg.key, content.key);
      }
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
    if (contextInfo && contextInfo.quotedMessage) {
      const qMsgType = getContentType(contextInfo.quotedMessage);
      const qContent = contextInfo.quotedMessage[qMsgType];

      let preview = '';
      if (qMsgType === 'conversation') preview = contextInfo.quotedMessage.conversation;
      else if (qMsgType === 'extendedTextMessage') preview = qContent?.text;
      else if (qContent?.caption) preview = qContent.caption;
      else preview = '[' + (qMsgType || 'message').replace('Message', '') + ']';

      if (JSON.stringify(contextInfo.quotedMessage).includes('viewOnce') || qContent?.viewOnce) {
        preview = '👁️ (View Once) ' + preview;
      }

      // append preview to body
      body = `[Replying to: ${preview.slice(0, 60)}${preview.length > 60 ? '...' : ''}]\n\n${body}`;
    }

    let mediaData = null;
    let hasMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(messageType);
    if (hasMedia) {
      mediaData = await downloadAndSaveMedia(msg.message);
    }

    const originalId = msg.key.id;

    const msgData = {
      messageId: msg.key.id,
      chatId,
      senderId,
      senderName,
      body,
      type: mediaData ? mediaData.type : 'chat',
      hasMedia: !!mediaData,
      mediaType: mediaData ? mediaData.mediaType : null,
      mediaFilename: mediaData ? mediaData.mediaFilename : null,
      mediaPath: mediaData ? mediaData.mediaPath : null,
      timestamp: msg.messageTimestamp,
      isFromMe: msg.key.fromMe || false,
      isViewOnce,
      originalId,
    };

    db.saveMessage(msgData);
    if (isViewOnce) log('WA', `Message cached: ${msgData.type} (view-once) in ${chatName} from ${senderName}`);

    broadcast('new_message', {
      ...msgData,
      chatName,
      isGroup: isGroup,
      profilePic: db.getChatProfilePic(chatId), // Could be populated sync since prefetch
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
      const chat = db.getChats().find(c => c.chat_id === deleted.chat_id);
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
      const allChats = Array.from(chats.values());
      const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));

      const results = await Promise.all(allChats
        .filter(c => c.id !== 'status@broadcast')
        .map(async c => {
          const isGroup = isJidGroup(c.id);
          let name = await getChatName(c.id);
          return {
            id: c.id,
            name: name,
            isGroup: isGroup,
            timestamp: c.conversationTimestamp || 0,
            isMonitored: monitored.has(c.id)
          };
        }));

      for (const chat of results.slice(0, 30)) {
        getProfilePic(chat.id);
      }

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
    setNotifyEnabled: (enabled) => {
      notifyWhatsApp = !!enabled;
      log('WA', `Notification forwarding ${notifyWhatsApp ? 'enabled' : 'disabled'}`);
    },
  };
}
