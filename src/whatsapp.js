import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { MEDIA_DIR } from './database.js';

const CACHEABLE_TYPES = new Set([
  'chat', 'image', 'video', 'audio', 'ptt', 'document',
  'sticker', 'location', 'vcard', 'multi_vcard',
]);

export function createMonitor(db, broadcast) {
  const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
  let clientReady = false;
  let myId = null;
  const notifyWhatsApp = process.env.NOTIFY_WHATSAPP !== 'false';

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
    console.log(`Phone pairing mode enabled for: ${phoneNumber}`);
  }

  const client = new Client(clientOpts);

  client.on('code', (code) => {
    console.log(`\n========================================`);
    console.log(`  PAIRING CODE: ${code}`);
    console.log(`  Enter this code on your phone:`);
    console.log(`  WhatsApp > Linked Devices > Link a Device`);
    console.log(`  > Link with phone number`);
    console.log(`========================================\n`);
  });

  client.on('qr', (qr) => {
    console.log('Scan this QR code to log in:');
    qrcode.generate(qr, { small: true });
  });

  client.once('authenticated', () => {
    console.log('WhatsApp authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('WhatsApp auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    clientReady = false;
    broadcast('status', { connected: false, reason });
  });

  client.once('ready', () => {
    myId = client.info.wid._serialized;
    clientReady = true;
    console.log('WhatsApp ready — monitoring messages');
    console.log('Logged in as:', myId);
    broadcast('status', { connected: true, id: myId });
  });

  client.on('message_create', async (message) => {
    if (!CACHEABLE_TYPES.has(message.type)) return;

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
      const chatName = chat.isGroup ? chat.name : (contact.pushname || contact.name || contact.number);

      db.upsertChat(chatId, chatName, chat.isGroup);

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
          console.error('Media download failed:', err.message);
        }
      }

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
      };

      db.saveMessage(msgData);

      broadcast('new_message', {
        ...msgData,
        chatName,
        isGroup: chat.isGroup,
      });
    } catch (err) {
      console.error('Error caching message:', err.message);
    }
  });

  client.on('message_revoke_everyone', async (revokedMsg, originalMsg) => {
    const fromChannel = revokedMsg.from?.endsWith('@newsletter') ||
                        revokedMsg.to?.endsWith('@newsletter');
    if (fromChannel) return;

    try {
      const revokedChat = await revokedMsg.getChat();
      if (!revokedChat || !revokedChat.id) return;
      const revokedChatId = revokedChat.id._serialized;
      if (!db.isMonitored(revokedChatId)) return;

      const messageId = revokedMsg.id._serialized;

      let cached = db.getMessage(messageId);

      if (!cached && originalMsg) {
        const chat = await originalMsg.getChat();
        const contact = await originalMsg.getContact();
        const chatId = chat.id._serialized;

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

        db.saveMessage({
          messageId,
          chatId,
          senderId,
          senderName,
          body: originalMsg.body || '',
          type: originalMsg.type || 'chat',
          hasMedia: originalMsg.hasMedia || false,
          mediaType: null,
          mediaFilename: null,
          mediaPath: null,
          timestamp: originalMsg.timestamp,
          isFromMe: originalMsg.fromMe,
        });

        cached = db.getMessage(messageId);
      }

      db.markDeleted(messageId);
      const deleted = db.getMessage(messageId);

      if (deleted) {
        const chat = db.getChats().find(c => c.chat_id === deleted.chat_id);
        const chatName = chat?.name || deleted.chat_id;

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
      console.error('Error handling message revoke:', err.message);
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
    } catch (err) {
      console.error('Failed to send deletion notification:', err.message);
    }
  }

  async function getWhatsAppChats() {
    if (!clientReady) return [];
    try {
      const allChats = await client.getChats();
      const monitored = new Set(db.getMonitoredChats().map(m => m.chat_id));
      return allChats
        .filter(c => c.id._serialized !== 'status@broadcast')
        .map(c => ({
          id: c.id._serialized,
          name: c.name || c.id.user,
          isGroup: c.isGroup,
          timestamp: c.timestamp || 0,
          isMonitored: monitored.has(c.id._serialized),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      console.error('Error fetching WhatsApp chats:', err.message);
      return [];
    }
  }

  return {
    client,
    start: () => client.initialize(),
    isReady: () => clientReady,
    getMyId: () => myId,
    getWhatsAppChats,
  };
}
