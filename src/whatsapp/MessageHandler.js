import { getContentType, extractMessageContent, isJidGroup } from '@whiskeysockets/baileys';
import { log } from '../logger.js';

export class MessageHandler {
  constructor(db, storeManager, jidResolver, mediaHandler, notificationManager, monitor, broadcast) {
    this.db = db;
    this.store = storeManager;
    this.resolver = jidResolver;
    this.mediaHandler = mediaHandler;
    this.notifications = notificationManager;
    this.monitor = monitor;
    this.broadcast = broadcast;
  }

  async handleMessageUpdate(event) {
    if (event.update?.message?.protocolMessage?.type === 0 || event.update?.message?.protocolMessage?.type === 'REVOKE') {
      await this.handleRevoke(event.key, event.update.message.protocolMessage.key);
    }
  }

  async handleRevoke(currentKey, revokedKey) {
    const chatId = currentKey.remoteJid;
    if (!(await this.resolver.checkIsMonitored(chatId))) return;

    const revokeId = currentKey.id;
    const origId = revokedKey?.id;

    let messageId = origId || revokeId;

    let cached = this.db.getMessage(messageId) || this.db.getMessage(revokeId) || (origId ? this.db.getMessageByOriginalId(origId) : null);
    if (cached) messageId = cached.message_id;

    this.db.markDeleted(messageId);
    if (origId && origId !== revokeId) this.db.markDeleted(revokeId);

    const deleted = this.db.getMessage(messageId);
    if (deleted) {
      const chat = this.db.getChat(deleted.chat_id);
      const chatName = chat?.name || deleted.chat_id;

      log('WA', `Message deleted in ${chatName} by ${deleted.sender_name || 'unknown'}`);
      this.broadcast('message_deleted', {
        ...deleted,
        chatName,
        isGroup: chat?.is_group || 0,
      });

      if (this.monitor.notifyWhatsApp && this.monitor.myId && !deleted.is_from_me) {
        this.notifications.sendDeletionNotification(deleted, chatName);
      }
    }
  }

  async handleMessage(msg) {
    const rawChatId = msg.key?.remoteJid;
    if (!rawChatId || rawChatId === 'status@broadcast') return;

    // Normalize to Phone Number for single unified chat view
    const chatId = await this.resolver.resolveToPN(rawChatId);

    // Baileys sometimes delivers view-once messages as stubs with no .message
    // but with msg.key.isViewOnce = true. We catch and record those.
    if (!msg.message) {
      if (msg.key?.isViewOnce && chatId) {
        if (!(await this.resolver.checkIsMonitored(chatId))) return;
        log('WA', `📸 View-Once STUB detected from ${chatId} (no message body — Baileys limitation)`);

        const isGroup = isJidGroup(chatId);
        let senderId = isGroup ? (msg.key.participant || chatId) : chatId;
        if (isGroup && msg.key.participantAlt && senderId.includes('@lid')) {
          senderId = msg.key.participantAlt;
        } else if (!isGroup && msg.key.remoteJidAlt && senderId.includes('@lid')) {
          senderId = msg.key.remoteJidAlt;
        }
        senderId = await this.resolver.resolveToPN(senderId);
        const senderName = await this.resolver.getChatName(senderId, msg.pushName);
        const chatName = await this.resolver.getChatName(chatId);
        const lid = rawChatId.includes('@lid') ? rawChatId : await this.resolver.resolveToLID(rawChatId);
        this.db.upsertChat(chatId, chatName, isGroup, lid);

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

        this.db.saveMessage(msgData);
        log('WA', `View-Once stub saved: ${chatName} from ${senderName}`);

        this.broadcast('new_message', {
          ...msgData,
          chat_name: chatName,
          is_group: isGroup ? 1 : 0,
          profile_pic: this.db.getChatProfilePic(chatId),
        });
      }
      return;
    }

    const mType = getContentType(msg.message) || 'stub';
    log('WA', `Received [${mType}] from ${rawChatId} (normalized: ${chatId})`);

    // Automatically track new chats based on incoming messages
    if (!this.store.chats.has(chatId) && chatId) {
      this.store.chats.set(chatId, { id: chatId });
      this.store.saveCache();
    }

    if (!(await this.resolver.checkIsMonitored(chatId))) return;

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
        await this.handleRevoke(msg.key, content.key);
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
      senderId = await this.resolver.resolveToPN(senderId);
      const senderName = await this.resolver.getChatName(senderId, msg.pushName);

      this.db.addReaction(targetId, senderId, senderName, emoji);
      this.broadcast('message_reaction', {
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

    senderId = await this.resolver.resolveToPN(senderId);

    let senderName = await this.resolver.getChatName(senderId, msg.pushName);
    let chatName = await this.resolver.getChatName(chatId);
    const lid = rawChatId.includes('@lid') ? rawChatId : await this.resolver.resolveToLID(rawChatId);

    this.db.upsertChat(chatId, chatName, isGroup, lid);
    this.resolver.getProfilePic(chatId); // prefetch

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
        quotedSender = await this.resolver.getChatName(rawQuotedSender);
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
            quotedViewOnceMedia = await this.mediaHandler.downloadAndSaveMedia(qMsg, { key: { remoteJid: chatId, id: quotedStanzaId, participant: rawQuotedSender } });
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
      mediaData = await this.mediaHandler.downloadAndSaveMedia(msg.message, msg);
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

    this.db.saveMessage(msgData);
    if (isViewOnce) log('WA', `Message cached: ${msgData.type} (view-once) in ${chatName} from ${senderName}`);

    this.broadcast('new_message', {
      ...msgData,
      chat_name: chatName,
      is_group: isGroup ? 1 : 0,
      profile_pic: this.db.getChatProfilePic(chatId), // Could be populated sync since prefetch
    });

    if (isViewOnce && this.monitor.notifyWhatsApp && this.monitor.myId && !msgData.is_from_me) {
      this.notifications.sendViewOnceNotification(msgData, chatName);
    }
  }
}
