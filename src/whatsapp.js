import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MEDIA_DIR } from './database.js';

const CACHEABLE_TYPES = new Set([
  'chat', 'image', 'video', 'audio', 'ptt', 'document',
  'sticker', 'location', 'vcard', 'multi_vcard',
]);

function log(category, message, ...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [${category}] ${message}`, ...args);
}

export function createMonitor(db, broadcast) {
  const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
  let clientReady = false;
  let clientAuthenticated = false;
  let myId = null;
  let notifyWhatsApp = process.env.NOTIFY_WHATSAPP === 'true';
  const profilePicFailed = new Map();
  const profilePicInFlight = new Set();

  const phoneNumber = process.env.WHATSAPP_PHONE || null;

  const clientOpts = {
    authStrategy: new LocalAuth({ clientId: 'msg-monitor' }),
    puppeteer: {
      executablePath: chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
      ],
    },
  };

  if (phoneNumber) {
    clientOpts.pairWithPhoneNumber = {
      phoneNumber,
      showNotification: true,
    };
    const masked = phoneNumber.slice(0, 3) + '***' + phoneNumber.slice(-2);
    log('WA', `Phone pairing mode enabled for: ${masked}`);
  }

  const client = new Client(clientOpts);

  client.on('code', (code) => {
    log('WA', `Pairing code received: ${code}`);
    console.log(`\n========================================`);
    console.log(`  PAIRING CODE: ${code}`);
    console.log(`  Enter this code on your phone:`);
    console.log(`  WhatsApp > Linked Devices > Link a Device`);
    console.log(`  > Link with phone number`);
    console.log(`========================================\n`);
  });

  client.on('qr', (qr) => {
    log('WA', 'QR code generated — scan to authenticate');
    qrcode.generate(qr, { small: true });
  });

  client.once('authenticated', () => {
    clientAuthenticated = true;
    log('WA', 'WhatsApp authenticated (session validated)');
    broadcast('status', { connected: false, authenticated: true });
  });

  client.on('auth_failure', (msg) => {
    clientAuthenticated = false;
    log('WA', `Auth failure: ${msg}`);
    broadcast('status', { connected: false, authenticated: false, reason: msg });
  });

  client.on('disconnected', (reason) => {
    log('WA', `Disconnected: ${reason}`);
    clientReady = false;
    clientAuthenticated = false;
    broadcast('status', { connected: false, authenticated: false, reason });
  });

  client.once('ready', () => {
    myId = client.info.wid._serialized;
    clientReady = true;
    clientAuthenticated = true;
    log('WA', `Ready — monitoring messages (logged in as: ${myId})`);
    broadcast('status', { connected: true, authenticated: true, id: myId });
  });

  function detectViewOnce(message) {
    const isMediaType = ['image', 'video', 'audio', 'ptt'].includes(message.type) || message.hasMedia;
    const d = message._data || {};
    const viewMode = d.viewMode;
    return !!(
      message.isViewOnce ||
      d.isViewOnce ||
      (isMediaType && viewMode && viewMode !== 0 && viewMode !== 'VISIBLE')
    );
  }

  async function handleMessage(message) {
    const isViewOnce = detectViewOnce(message);

    if (!CACHEABLE_TYPES.has(message.type) && !isViewOnce) return;

    const fromChannel = message.from?.endsWith('@newsletter') ||
                        message.to?.endsWith('@newsletter') ||
                        message.id?.remote?.endsWith('@newsletter');
    if (fromChannel) return;

    try {
      const chat = await message.getChat();
      if (!chat || !chat.id) return;
      const chatId = chat.id._serialized;

      if (!db.isMonitored(chatId)) return;

      const contact = await message.getContact();
      const chatName = chat.isGroup
        ? (chat.name || chat.id.user)
        : (contact.pushname || contact.name || chat.name || chat.id.user);

      db.upsertChat(chatId, chatName, chat.isGroup);

      if (!db.getChatProfilePic(chatId)) {
        const lastFail = profilePicFailed.get(chatId);
        if (!profilePicInFlight.has(chatId) && (!lastFail || Date.now() - lastFail > 300_000)) {
          const picSource = chat.isGroup ? chat : contact;
          const contactCusId = !chat.isGroup ? contact.id?._serialized : null;
          profilePicInFlight.add(chatId);
          fetchAndSaveProfilePic(picSource, chatId, contactCusId).then((pic) => {
            if (pic) {
              db.updateChatProfilePic(chatId, pic);
              profilePicFailed.delete(chatId);
            } else {
              profilePicFailed.set(chatId, Date.now());
            }
          }).finally(() => {
            profilePicInFlight.delete(chatId);
          });
        }
      }

      let senderId = null;
      let senderName = null;
      if (chat.isGroup && message.author) {
        senderId = message.author;
        try {
          const senderContact = await client.getContactById(message.author);
          senderName = senderContact.pushname || senderContact.name || senderContact.number;
        } catch {
          senderName = message.author.replace('@c.us', '');
        }
      } else {
        senderId = contact.id._serialized;
        senderName = contact.pushname || contact.name || contact.number;
      }

      let mediaPath = null;
      let mediaType = null;
      let mediaFilename = null;

      if (message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          if (media) {
            const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
            const filename = `${message.id._serialized}.${ext}`;
            const filepath = join(MEDIA_DIR, filename);
            writeFileSync(filepath, Buffer.from(media.data, 'base64'));
            mediaPath = filename;
            mediaType = media.mimetype;
            mediaFilename = media.filename || filename;
          }
        } catch (err) {
          log('WA', `Media download failed: ${err.message}`);
        }
      }

      if (isViewOnce) {
        log('WA', `View-once message captured: ${message.type} in ${chatName} from ${senderName}`);
      }

      const originalId = message.id.id; // The pure hash ID without serialized metadata (useful for revoke matching)

      const msgData = {
        messageId: message.id._serialized,
        chatId,
        senderId,
        senderName,
        body: message.body || '',
        type: message.type,
        hasMedia: message.hasMedia,
        mediaType,
        mediaFilename,
        mediaPath,
        timestamp: message.timestamp,
        isFromMe: message.fromMe,
        isViewOnce,
        originalId,
      };

      db.saveMessage(msgData);
      log('WA', `Message cached: ${message.type}${isViewOnce ? ' (view-once)' : ''} in ${chatName} from ${senderName}`);

      broadcast('new_message', {
        ...msgData,
        chatName,
        isGroup: chat.isGroup,
        profilePic: db.getChatProfilePic(chatId) || null,
      });
    } catch (err) {
      log('WA', `Error caching message: ${err.message}`);
    }
  }

  client.on('message_create', (message) => handleMessage(message));

  client.on('message_revoke_everyone', async (revokedMsg, originalMsg) => {
    const fromChannel = revokedMsg.from?.endsWith('@newsletter') ||
                        revokedMsg.to?.endsWith('@newsletter');
    if (fromChannel) return;

    try {
      const revokedChat = await revokedMsg.getChat();
      if (!revokedChat || !revokedChat.id) return;
      const revokedChatId = revokedChat.id._serialized;
      if (!db.isMonitored(revokedChatId)) return;

      const revokeId = revokedMsg.id._serialized;
      const origId = originalMsg?.id?._serialized;

      // Stickers often have a different serialized ID but same core `id` hash.
      const protocolMessageId = revokedMsg._data?.protocolMessageKey?.id || originalMsg?.id?.id;

      let messageId = origId || revokeId;

      log('WA', `Revoke event: revokeId=${revokeId}, origId=${origId || 'none'}, protocolMsgId=${protocolMessageId || 'none'}, using=${messageId}`);

      let cached = db.getMessage(messageId);
      if (!cached && origId !== revokeId) {
        cached = db.getMessage(revokeId);
      }
      if (!cached && protocolMessageId) {
        // Fallback to match by the pure hash. This fixes sticker deletion mismatches.
        cached = db.getMessageByOriginalId(protocolMessageId);
        if (cached) {
          messageId = cached.message_id; // override to the correctly matched serialized ID
          log('WA', `Revoke matched by originalId hash: ${messageId}`);
        }
      }

      if (!cached && originalMsg) {
        const chat = await originalMsg.getChat();
        const contact = await originalMsg.getContact();
        const chatId = chat.id._serialized;

        const revokedChatName = chat.isGroup
          ? (chat.name || chat.id.user)
          : (contact.pushname || contact.name || chat.name || chat.id.user);

        db.upsertChat(chatId, revokedChatName, chat.isGroup);

        let senderId = null;
        let senderName = null;
        if (chat.isGroup && originalMsg.author) {
          senderId = originalMsg.author;
          try {
            const sc = await client.getContactById(originalMsg.author);
            senderName = sc.pushname || sc.name || sc.number;
          } catch {
            senderName = originalMsg.author.replace('@c.us', '');
          }
        } else {
          senderId = contact.id._serialized;
          senderName = contact.pushname || contact.name || contact.number;
        }

        let mediaPath = null;
        let mediaType = null;
        let mediaFilename = null;
        if (originalMsg.hasMedia) {
          try {
            const media = await originalMsg.downloadMedia();
            if (media) {
              const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
              const filename = `${messageId}.${ext}`;
              const filepath = join(MEDIA_DIR, filename);
              writeFileSync(filepath, Buffer.from(media.data, 'base64'));
              mediaPath = filename;
              mediaType = media.mimetype;
              mediaFilename = media.filename || filename;
            }
          } catch (err) {
            log('WA', `Media download on revoke failed: ${err.message}`);
          }
        }

        db.saveMessage({
          messageId,
          chatId,
          senderId,
          senderName,
          body: originalMsg.body || '',
          type: originalMsg.type || 'chat',
          hasMedia: originalMsg.hasMedia || false,
          mediaType,
          mediaFilename,
          mediaPath,
          timestamp: originalMsg.timestamp,
          isFromMe: originalMsg.fromMe,
          isViewOnce: detectViewOnce(originalMsg),
          originalId: originalMsg.id?.id,
        });

        cached = db.getMessage(messageId);
      }

      db.markDeleted(messageId);
      if (origId && origId !== revokeId) {
        db.markDeleted(revokeId);
      }
      const deleted = db.getMessage(messageId);

      if (deleted) {
        const chat = db.getChats().find(c => c.chat_id === deleted.chat_id);
        const chatName = chat?.name || deleted.chat_id;

        log('WA', `Message deleted in ${chatName} by ${deleted.sender_name || 'unknown'}: "${(deleted.body || '').slice(0, 50)}"`);

        broadcast('message_deleted', {
          ...deleted,
          chatName,
          isGroup: chat?.is_group || 0,
        });

        if (notifyWhatsApp && myId && !deleted.is_from_me) {
          sendDeletionNotification(deleted, chatName);
        }
      }
    } catch (err) {
      log('WA', `Error handling message revoke: ${err.message}`);
    }
  });

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

      await client.sendMessage(myId, text);
      log('WA', `Deletion notification sent to self`);
    } catch (err) {
      log('WA', `Failed to send deletion notification: ${err.message}`);
    }
  }

  async function fetchAndSaveProfilePic(chatOrContact, chatId, contactCusId) {
    try {
      let url = null;

      const idsToTry = [contactCusId, chatId];
      if (chatOrContact.id) {
        const altId = chatOrContact.id._serialized;
        if (altId) idsToTry.push(altId);
      }
      const uniqueIds = [...new Set(idsToTry.filter(Boolean))];

      for (const id of uniqueIds) {
        if (url) break;
        try { url = await client.getProfilePicUrl(id); } catch { /* ignore */ }
      }

      if (!url) {
        try {
          const thumbUrl = await client.pupPage.evaluate(async (ids) => {
            for (const id of ids) {
              try {
                const contact = window.Store.Contact.get(id);
                if (contact?.profilePicThumb?.eurl) return contact.profilePicThumb.eurl;
                if (contact?.profilePicThumb?.imgFull) return contact.profilePicThumb.imgFull;
              } catch { /* ignore */ }
              try {
                const wid = window.Store.WidFactory.createWid(id);
                const contact = window.Store.Contact.get(wid);
                if (contact?.profilePicThumb?.eurl) return contact.profilePicThumb.eurl;
                if (contact?.profilePicThumb?.imgFull) return contact.profilePicThumb.imgFull;
              } catch { /* ignore */ }
            }
            return null;
          }, uniqueIds);
          if (thumbUrl) url = thumbUrl;
        } catch { /* pupPage not available or evaluate failed */ }
      }

      if (!url) {
        log('WA', `No profile pic available for ${chatId}`);
        return null;
      }

      const filename = `dp_${chatId.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      const filepath = join(MEDIA_DIR, filename);

      if (existsSync(filepath)) return filename;

      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(filepath, buffer);
      log('WA', `Profile pic saved for ${chatId}`);
      return filename;
    } catch (err) {
      log('WA', `Profile pic fetch error for ${chatId}: ${err.message}`);
      return null;
    }
  }

  async function getWhatsAppChats() {
    if (!clientReady) {
      log('WA', 'getWhatsAppChats called but client not ready');
      return [];
    }
    try {
      const allChats = await client.getChats();
      const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));
      const results = allChats
        .filter(c => c.id._serialized !== 'status@broadcast')
        .map(c => ({
          id: c.id._serialized,
          name: c.name || c.id.user,
          isGroup: c.isGroup,
          timestamp: c.timestamp || 0,
          isMonitored: monitored.has(c.id._serialized),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      for (const chat of allChats.slice(0, 30)) {
        const cid = chat.id._serialized;
        if (cid === 'status@broadcast') continue;
        if (db.getChatProfilePic(cid)) continue;
        fetchAndSaveProfilePic(chat, cid).then((pic) => {
          if (pic) db.updateChatProfilePic(cid, pic);
        });
      }

      return results;
    } catch (err) {
      log('WA', `Error fetching WhatsApp chats: ${err.message}`);
      return [];
    }
  }

  return {
    client,
    start: () => {
      log('WA', `Initializing WhatsApp client (chromium: ${chromiumPath})`);
      client.initialize();
    },
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
