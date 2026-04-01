import { extractMessageContent, getContentType, jidNormalizedUser, WAMessage, isJidGroup } from '@whiskeysockets/baileys';
import { log } from '../logger.js';
import { getDb, getMediaDir } from '../db/database.js';
import { syncService } from './sync.ts';
import { downloadMedia, downloadProfilePic } from './media.ts';
import { join } from 'path';
import { BroadcastFn, WhatsAppMessage } from '../types.ts';
import { getChatNameAsync, extractJidId } from './utils.ts';

export class MessageProcessor {
  constructor(private sock: any, private broadcast: BroadcastFn) {}

  /**
   * Verifies if a chat is being monitored. Checks both Phone Number (PN) 
   * and Linked Identifier (LID) to ensure consistent monitoring across JID types.
   */
  private async checkIsMonitored(jid: string): Promise<boolean> {
    if (!jid) return false;
    const ids = await syncService.getRelatedJids(jid, this.sock);
    return ids.some(id => getDb().isMonitored(id));
  }

  /**
   * Resolves the actual sender JID, handling WhatsApp's LID/PN mapping fallbacks.
   * Uses participantAlt/remoteJidAlt if the primary ID is an LID to ensure we store the Phone Number sender.
   */
  private async resolveSender(msg: WAMessage, chatId: string, isGrp: boolean): Promise<string> {
    let senderId = isGrp ? (msg.key.participant || chatId) : chatId;

    // Fallback to PN-based IDs (participantAlt/remoteJidAlt) if the current ID is an LID
    if (isGrp && (msg.key as any).participantAlt && senderId.includes('@lid')) {
      senderId = (msg.key as any).participantAlt;
    } else if (!isGrp && (msg.key as any).remoteJidAlt && senderId.includes('@lid')) {
      senderId = (msg.key as any).remoteJidAlt;
    }

    senderId = await syncService.resolvePN(senderId, this.sock);
    return senderId;
  }

  private async handleRevoke(currentKey: any, revokedKey: any) {
    const chatId = currentKey.remoteJid;
    if (!(await this.checkIsMonitored(chatId))) return;

    const revokeId = currentKey.id;
    const origId = revokedKey?.id;

    let messageId = origId || revokeId;
    const cached = getDb().getMessage(messageId) || getDb().getMessage(revokeId) || (origId ? getDb().getMessageByOriginalId(origId) : null);
    if (cached) messageId = cached.message_id;

    getDb().markDeleted(messageId);
    if (origId && origId !== revokeId) getDb().markDeleted(revokeId);

    const deleted = getDb().getMessage(messageId);
    if (deleted) {
      const chat = getDb().getChat(deleted.chat_id);
      const chatName = chat?.name || deleted.chat_id;

      log('PROCESSOR', `Message deleted in ${chatName} by ${deleted.sender_name || 'unknown'}`);
      this.broadcast('message_deleted', {
        ...deleted,
        chatName,
        isGroup: chat?.is_group || 0,
        deleted_at: new Date().toISOString()
      });

      const settings = getDb().getSettings();
      if (settings.whatsapp_notify === 'true' && !deleted.is_from_me) {
        await this.sendDeletionNotification(deleted, chatName);
      }
    }
  }

  /**
   * Processes message update events, specifically looking for 'REVOKE' (deletion) 
   * and 'MESSAGE_EDIT' protocol messages.
   */
  public async handleMessageUpdate(event: any) {
    const protocolMsg = event.update?.message?.protocolMessage;
    if (!protocolMsg) return;
    await this.handleProtocolMessage(event.key, protocolMsg);
  }

  /**
   * Centralized handler for protocol messages (Revoke/Edit).
   */
  private async handleProtocolMessage(key: any, protocolMsg: any) {
    if (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE') {
      await this.handleRevoke(key, protocolMsg.key);
    } else if (protocolMsg.type === 14 || protocolMsg.type === 'MESSAGE_EDIT') {
      await this.handleEdit(protocolMsg.key, protocolMsg.editedMessage);
    }
  }

  /**
   * Processes an edited message, updates the local database, and broadcasts the event.
   */
  private async handleEdit(key: any, editedMessage: any) {
    const messageId = key.id;
    const rawChatId = key.remoteJid;
    if (!rawChatId || !messageId) return;

    const chatId = await syncService.resolvePN(rawChatId, this.sock);
    if (!(await this.checkIsMonitored(chatId))) return;

    const content = extractMessageContent(editedMessage);
    if (!content) return;

    const mType = getContentType(content);
    if (!mType) return;

    const inner = (content as any)[mType];
    let body = '';
    if (mType === 'conversation') body = (content as any).conversation;
    else if (mType === 'extendedTextMessage') body = inner.text;
    else if (inner && inner.caption) body = inner.caption;

    if (body !== undefined) {
      const oldMsg = getDb().getMessage(messageId);
      const oldBody = oldMsg?.body;
      
      getDb().updateMessageBody(messageId, body);
      
      if (oldBody !== undefined && oldBody !== null && oldBody !== body) {
        getDb().addMessageEdit(messageId, oldBody, body);
      }
      
      log('PROCESSOR', `Message edited: ${messageId} in ${chatId}`);
      
      this.broadcast('message_edited', {
        message_id: messageId,
        chat_id: chatId,
        body: body,
        old_body: oldBody,
        updated_at: new Date().toISOString()
      });
    }
  }

  public async handleMessage(msg: WAMessage) {
    const rawChatId = msg.key?.remoteJid;
    if (!rawChatId || rawChatId === 'status@broadcast') return;

    // Normalize to Phone Number for single unified chat view
    const chatId = await syncService.resolvePN(rawChatId, this.sock);

    // Process "View Once" stubs that contain metadata but no message body (standard Baileys behavior)
    if (!msg.message) {
      if ((msg.key as any)?.isViewOnce && chatId) {
        if (!(await this.checkIsMonitored(chatId))) return;
        
        log('PROCESSOR', `📸 View-Once STUB detected from ${chatId}`);
        const isGrp = !!isJidGroup(chatId);
        const senderId = await this.resolveSender(msg, chatId, isGrp);
        const senderName = await getChatNameAsync(senderId, msg.pushName || null, this.sock);
        const chatName = await getChatNameAsync(chatId, null, this.sock);
        const lid = rawChatId.includes('@lid') ? rawChatId : await syncService.resolveLID(rawChatId, this.sock);
        
        getDb().upsertChat(chatId, chatName, isGrp, lid);

        const msgData = {
          message_id: msg.key.id!,
          chat_id: chatId,
          sender_id: senderId,
          sender_name: senderName,
          body: '👁️ View-Once media',
          type: 'chat',
          has_media: false,
          media_type: undefined as string | undefined,
          media_filename: undefined as string | undefined,
          media_path: undefined as string | undefined,
          media_sha256: undefined as string | undefined,
          timestamp: msg.messageTimestamp as number,
          is_from_me: msg.key.fromMe ? 1 : 0,
          is_deleted: 0,
          is_view_once: 1,
          original_id: msg.key.id!,
          quoted_stanza_id: null as string | null,
          quoted_sender: null as string | null,
          quoted_preview: null as string | null,
        };

        getDb().saveMessage(msgData);
        this.broadcast('new_message', {
          ...msgData,
          chat_name: chatName,
          is_group: isGrp ? 1 : 0,
          profile_pic: getDb().getChatProfilePic(chatId),
        });
      }
      return;
    }

    const mType = getContentType(msg.message) || 'stub';

    // Automatically track and save metadata for any newly encountered chats
    if (!syncService.chats.has(chatId) && chatId) {
      syncService.chats.set(chatId, { id: chatId });
      syncService.save();
    }

    if (!(await this.checkIsMonitored(chatId))) return;

    log('PROCESSOR', `Received [${mType}] from ${rawChatId} (normalized: ${chatId})`);

    // Recursively unwrap message layers (Ephemeral, View-Once, Document wrappers) to reach the core content
    let tempMsg: any = msg.message;
    const wrappers = ['ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
    let messageType = getContentType(tempMsg);
    let isViewOnce = false;

    const rawKeys = Object.keys(tempMsg || {});

    // Handle senderKeyDistributionMessage + viewOnce combo (group messages)
    if (messageType === 'senderKeyDistributionMessage' && rawKeys.length > 1) {
      const realKey = rawKeys.find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
      if (realKey) {
        log('PROCESSOR', `Skipping senderKeyDistribution, real content: ${realKey}`);
        tempMsg = { [realKey]: tempMsg[realKey] };
        messageType = realKey as any;
      }
    }

    while (messageType && wrappers.includes(messageType)) {
      if (messageType.includes('viewOnce')) isViewOnce = true;
      log('PROCESSOR', `Unwrapping ${messageType} from ${chatId}...`);
      tempMsg = extractMessageContent(tempMsg);
      messageType = getContentType(tempMsg);
    }

    // Secondary view-once detection on the inner content
    if (tempMsg && messageType && tempMsg[messageType]?.viewOnce) {
      isViewOnce = true;
    }

    if (isViewOnce) {
      log('PROCESSOR', `Confirmed View-Once message (${messageType}) from ${chatId}`);
    }

    // Assign back the unwrapped message
    msg.message = tempMsg;

    if (!messageType) {
      if (isViewOnce) log('PROCESSOR', `Abort: No unwrapped messageType for View-Once`);
      return;
    }

    const content = tempMsg[messageType];

    if (messageType === 'protocolMessage') {
      await this.handleProtocolMessage(msg.key, content);
      return;
    }

    // Process incoming message reactions and sync them to the database
    if (messageType === 'reactionMessage') {
      const reaction = content;
      const targetKey = reaction.key;
      if (!targetKey?.id) return;

      const targetId = targetKey.id;
      const emoji = reaction.text || '';
      const isGrp = !!isJidGroup(chatId);
      const senderId = await this.resolveSender(msg, chatId, isGrp);
      const senderName = await getChatNameAsync(senderId, msg.pushName || null, this.sock);

      getDb().addReaction(targetId, senderId, senderName, emoji);
      this.broadcast('message_reaction', {
        chat_id: chatId,
        message_id: targetId,
        sender_id: senderId,
        sender_name: senderName,
        emoji: emoji,
      });
      return;
    }

    const isGrp = !!isJidGroup(chatId);
    const senderId = await this.resolveSender(msg, chatId, isGrp);
    const senderName = await getChatNameAsync(senderId, msg.pushName || null, this.sock);
    const chatName = await getChatNameAsync(chatId, null, this.sock);
    const lid = rawChatId.includes('@lid') ? rawChatId : await syncService.resolveLID(rawChatId, this.sock);

    getDb().upsertChat(chatId, chatName, isGrp, lid);

    // Asynchronously fetch and cache the profile picture if not already stored
    this.getProfilePicAsync(chatId);

    let body = '';
    if (messageType === 'conversation') body = (msg.message as any)?.conversation || '';
    else if (messageType === 'extendedTextMessage') body = content.text;
    else if (content && content.caption) body = content.caption;

    // Extract and process quoted message metadata (replies), including view-once content in replies
    const contextInfo = content?.contextInfo || msg.message?.extendedTextMessage?.contextInfo || (msg.message as any)?.imageMessage?.contextInfo || (msg.message as any)?.videoMessage?.contextInfo;
    let quotedStanzaId: string | null = null;
    let quotedSender: string | null = null;
    let quotedPreview: string | null = null;
    let quotedViewOnceMedia: any = null;

    if (contextInfo && contextInfo.quotedMessage) {
      quotedStanzaId = contextInfo.stanzaId || null;
      const rawQuotedSender = contextInfo.participant || null;
      if (rawQuotedSender) {
        quotedSender = await getChatNameAsync(rawQuotedSender, null, this.sock);
      }

      // Check if quoted message contains view-once media
      const quotedStr = JSON.stringify(contextInfo.quotedMessage);
      const quotedIsViewOnce = quotedStr.includes('viewOnce') || quotedStr.includes('viewOnceMessage');

      const qMsg = extractMessageContent(contextInfo.quotedMessage);
      const qMsgType = getContentType(qMsg);
      const qContent = qMsg ? (qMsg as any)[qMsgType!] : null;

      let preview: string;
      if (qMsgType === 'conversation') preview = (qMsg as any).conversation;
      else if (qMsgType === 'extendedTextMessage') preview = qContent?.text;
      else if (qContent?.caption) preview = qContent.caption;
      else {
        const typeLabel = (qMsgType || 'message')
          .replace('Message', '')
          .replace('ptt', 'Audio')
          .replace('audio', 'Audio')
          .replace('image', 'Photo')
          .replace('video', 'Video')
          .replace('sticker', 'Sticker')
          .replace('document', 'Document');
        preview = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
      }

      if (quotedIsViewOnce || qContent?.viewOnce) {
        preview = '👁️ View Once ' + (preview.startsWith('👁️') ? preview.slice(2) : preview);

        // Try to download the quoted view-once media
        const quotedMediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        if (qMsgType && quotedMediaTypes.includes(qMsgType) && qContent) {
          log('PROCESSOR', `Attempting to download quoted view-once ${qMsgType}...`);
          try {
            const fakeMsg = { message: qMsg, key: { remoteJid: chatId, id: quotedStanzaId, participant: rawQuotedSender } } as any;
            const res = await downloadMedia(fakeMsg, qMsgType.replace('Message', ''), this.sock);
            if (res) {
              quotedViewOnceMedia = { ...res, type: qMsgType.replace('Message', '') };
              log('PROCESSOR', `Successfully saved quoted view-once media: ${quotedViewOnceMedia.path} (${quotedViewOnceMedia.type})`);
            }
          } catch (e: any) {
            log('PROCESSOR', `Failed to download quoted view-once media: ${e.message}`);
          }
        }
      }

      quotedPreview = preview ? preview.slice(0, 100) : null;
    }

    // Download and store media attachments (images, videos, documents, stickers)
    let mediaPath = null;
    let mediaSha256: string | null = null;
    const hasMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(messageType);
    
    if (hasMedia) {
      const mediaResult = await downloadMedia(msg, messageType.replace('Message', ''), this.sock);
      if (mediaResult) {
        mediaPath = mediaResult.path;
        mediaSha256 = mediaResult.sha256hex;
      }
    }

    // If replying to a view-once message, save the recovered media to the original message
    if (quotedViewOnceMedia && quotedStanzaId) {
      getDb().updateMessageMedia(quotedStanzaId, quotedViewOnceMedia.path, quotedViewOnceMedia.sha256hex, quotedViewOnceMedia.type || 'image');
    }

    const msgData: WhatsAppMessage = {
      message_id: msg.key.id!,
      chat_id: chatId,
      sender_id: senderId,
      sender_name: senderName,
      body,
      type: mediaPath ? messageType.replace('Message', '') : 'chat',
      has_media: !!mediaPath,
      media_type: mediaPath ? (content.mimetype || messageType.replace('Message', '')) : undefined,
      media_filename: mediaPath ? (content.fileName || undefined) : undefined,
      media_path: mediaPath || undefined,
      media_sha256: mediaSha256 || undefined,
      timestamp: msg.messageTimestamp as number,
      is_from_me: msg.key.fromMe ? 1 : 0,
      is_deleted: 0,
      is_view_once: isViewOnce ? 1 : 0,
      original_id: msg.key.id!,
      quoted_stanza_id: quotedStanzaId || undefined,
      quoted_sender: quotedSender || undefined,
      quoted_preview: quotedPreview || undefined,
    };

    getDb().saveMessage(msgData);
    if (isViewOnce) log('PROCESSOR', `Message cached: ${msgData.type} (view-once) in ${chatName} from ${senderName}`);

    this.broadcast('new_message', {
      ...msgData,
      chat_name: chatName,
      is_group: isGrp ? 1 : 0,
      profile_pic: getDb().getChatProfilePic(chatId),
    });

    // Forward a private notification copy if a View-Once message is detected and notifications are enabled
    const settings = getDb().getSettings();
    if (isViewOnce && settings.whatsapp_notify === 'true' && !msgData.is_from_me) {
      await this.sendViewOnceNotification(msgData, chatName);
    }
  }

  /**
   * Sends a replica of a View-Once message to the monitored user's own chat.
   */
  private async sendViewOnceNotification(msg: WhatsAppMessage, chatName: string) {
    try {
      if (!this.sock) return;
      const myId = jidNormalizedUser(this.sock.user.id);

      const from = msg.sender_name || 'Unknown';
      const mType = msg.type ? msg.type.toUpperCase() : 'MEDIA';
      const text = `👁️ *View-Once* from *${from}* (${chatName}) [${mType}]`;

      if (msg.has_media && msg.media_path) {
        const fullPath = join(getMediaDir(), msg.media_path);
        if (await Bun.file(fullPath).exists()) {
          const content: any = { caption: text };
          if (msg.type === 'image') content.image = { url: fullPath };
          else if (msg.type === 'video') content.video = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await this.sock.sendMessage(myId, content);
          log('PROCESSOR', `Sent view-once notification for ${msg.message_id}`);
        }
      }
    } catch (err: any) {
      log('PROCESSOR', `Failed to send view-once notification: ${err.message}`);
    }
  }

  /**
   * Sends a notification with the content of a deleted message to the monitored user tray.
   */
  private async sendDeletionNotification(msg: any, chatName: string) {
    try {
      if (!this.sock) return;
      const myId = jidNormalizedUser(this.sock.user.id);

      const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const from = msg.sender_name || 'Unknown';
      const mType = msg.type !== 'chat' && msg.type ? ` [${msg.type.toUpperCase()}]` : '';

      const text = [
        `🗑️ *Deleted* from *${from}* (${chatName}) at ${time}${mType}:`,
        msg.body ? `> ${msg.body}` : (msg.has_media ? '' : '_No text content_')
      ].filter((r: string) => r !== '').join('\n');

      if (msg.has_media && msg.media_path) {
        const fullPath = join(getMediaDir(), msg.media_path);
        if (await Bun.file(fullPath).exists()) {
          const mediaType = msg.type;
          const content: any = { caption: text };

          if (mediaType === 'image') content.image = { url: fullPath };
          else if (mediaType === 'video') content.video = { url: fullPath };
          else if (mediaType === 'audio') {
            content.audio = { url: fullPath };
            content.mimetype = 'audio/ogg; codecs=opus';
            content.ptt = true;
          }
          else if (mediaType === 'sticker') content.sticker = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await this.sock.sendMessage(myId, content);
          log('PROCESSOR', `Sent media deletion notification for ${msg.message_id}`);
          return;
        }
      }

      await this.sock.sendMessage(myId, { text });
      log('PROCESSOR', `Sent deletion notification for ${msg.message_id}`);
    } catch (err: any) {
      log('PROCESSOR', `Failed to send deletion notification: ${err.message}`);
    }
  }

  /**
   * Fire-and-forget profile pic prefetch
   */
  private getProfilePicAsync(jid: string) {
    if (!jid || !this.sock) return;
    downloadProfilePic(jid, this.sock).then(res => {
      if (res?.isNew) {
        this.broadcast('profile_pic_updated', {
          chat_id: jid,
          profile_pic: res.filename
        });
      }
    }).catch(() => {});
  }
}
