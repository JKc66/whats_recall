import { isJidGroup, extractMessageContent, getContentType } from '@whiskeysockets/baileys';
import { extractJidId } from '../shared/jid.ts';
import type { proto } from '@whiskeysockets/baileys';
import { log } from '../logger.ts';
import { syncService } from './sync.ts';

/**
 * Recursively unwraps message layers (Ephemeral, View-Once, etc.) to reach the core content.
 * Returns the unwrapped message and a flag indicating if it was a View-Once message.
 */
export function normalizeMessage(message: proto.IMessage | null | undefined): { content: proto.IMessage | null, isViewOnce: boolean, type: string | null, contextInfo: any | null } {
  if (!message) return { content: null, isViewOnce: false, type: null, contextInfo: null };

  let tempMsg: any = message;
  const wrappers = ['ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
  let isViewOnce = false;

  const rawKeys = Object.keys(tempMsg);
  // Handle senderKeyDistributionMessage + viewOnce combo (group messages)
  if (getContentType(tempMsg) === 'senderKeyDistributionMessage' && rawKeys.length > 1) {
    const realKey = rawKeys.find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
    if (realKey) {
      tempMsg = { [realKey]: tempMsg[realKey] };
    }
  }

  let messageType = getContentType(tempMsg);
  while (messageType && wrappers.includes(messageType)) {
    if (messageType.includes('viewOnce')) isViewOnce = true;
    tempMsg = extractMessageContent(tempMsg);
    messageType = getContentType(tempMsg);
  }

  if (tempMsg && messageType && tempMsg[messageType]?.viewOnce) {
    isViewOnce = true;
  }

  const contextInfo = tempMsg && messageType ? (tempMsg[messageType]?.contextInfo || tempMsg.contextInfo) : null;

  return { content: tempMsg, isViewOnce, type: messageType || null, contextInfo };
}

/**
 * Extracts a human-readable text body from various message content types.
 */
export function getMessageBody(content: proto.IMessage | null | undefined, type: string | null, includeLabel = false): string | undefined {
  if (!content || !type) return undefined;
  const inner = (content as any)[type];
  if (type === 'conversation') return (content as any).conversation;
  if (type === 'extendedTextMessage') return inner.text;
  if (inner && 'caption' in inner) return inner.caption;
  if (type === 'templateButtonReplyMessage') return inner.selectedId;
  if (type === 'buttonsResponseMessage') return inner.selectedButtonId;

  if (includeLabel) {
    const typeLabel = (type || 'message')
      .replace('Message', '')
      .replace('ptt', 'Audio')
      .replace('audio', 'Audio')
      .replace('image', 'Photo')
      .replace('video', 'Video')
      .replace('sticker', 'Sticker')
      .replace('document', 'Document');
    return typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  }

  return undefined;
}

/**
 * Resolves WhatsApp mentions (@phone) in a text body to human-readable names.
 */
export async function enrichMentions(text: string, mentionedJid: string[] | undefined | null, sock: any): Promise<string> {
  if (!text || !mentionedJid || mentionedJid.length === 0) return text;
  let enriched = text;
  for (const jid of mentionedJid) {
    const name = await getChatNameAsync(jid, null, sock);
    const mentionId = jid.split('@')[0];
    const mention = `@${mentionId}`;
    enriched = enriched.split(mention).join(`@${name}`);
  }
  return enriched;
}

export { extractJidId };

/**
 * Resolves a human-readable name for a JID using locally cached contact and chat data.
 * This function is strictly synchronous to ensure high performance during list rendering.
 */
export function getChatName(jid: string, pushName: string | null = null): string {
  if (!jid) return 'Unknown';

  // Perform local-only alternate JID resolution (LID <-> PN mapping)
  let altJid: string | null = null;
  if (jid.includes('@lid')) {
    const resolved = syncService.lidToPn.get(jid);
    if (resolved && resolved !== jid) altJid = resolved;
  } else if (jid.includes('@s.whatsapp.net')) {
    altJid = syncService.pnToLid.get(jid) || null;
  }

  const contact = syncService.contacts.get(jid) || {};
  const chat = syncService.chats.get(jid) || {};
  const altContact = altJid ? (syncService.contacts.get(altJid) || {}) : {};
  const altChat = altJid ? (syncService.chats.get(altJid) || {}) : {};

  // 1. Phone-saved contact name or verified business name
  if (contact.name) return contact.name;
  if (altContact.name) return altContact.name;
  if (contact.verifiedName) return contact.verifiedName;
  if (altContact.verifiedName) return altContact.verifiedName;

  // 2. Chat name (group subject or synced name)
  const jidId = extractJidId(jid);
  if (chat.name && !chat.name.includes(jidId)) return chat.name;
  if (altJid && altChat.name && !altChat.name.includes(extractJidId(altJid))) return altChat.name;

  // 3. Push name (real-time or stored)
  if (pushName) return pushName;
  if (contact.notify || contact.pushname) return contact.notify || contact.pushname;
  if (altContact.notify || altContact.pushname) return altContact.notify || altContact.pushname;
  if (chat.notify) return chat.notify;
  if (altChat.notify) return altChat.notify;

  // NOTE: We avoid async network calls (like sock.groupMetadata) here to keep the function pure and fast.

  return jidId;
}

/**
 * Async version of getChatName that also tries group metadata.
 * Used only where we can afford the async call (message processing).
 */
export async function getChatNameAsync(jid: string, pushName: string | null = null, sock: any = null): Promise<string> {
  const name = getChatName(jid, pushName);
  
  // If we got a real name, return it
  if (name !== extractJidId(jid)) return name;

  // Try group metadata as last resort
  if (sock && isJidGroup(jid)) {
    try {
      const metadata = await sock.groupMetadata(jid);
      if (metadata?.subject) {
        syncService.chats.set(jid, { ...(syncService.chats.get(jid) || {}), id: jid, name: metadata.subject });
        return metadata.subject;
      }
    } catch (e: any) {
      log('WA-UTILS', `Failed to fetch group metadata for ${jid}: ${e.message}`);
    }
  }

  return name;
}

export function safeMerge(oldObj: any, newObj: any) {
  const merged = { ...oldObj };
  const keys = Object.keys(newObj);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const val = newObj[key];
    if (val !== undefined && val !== null) {
      merged[key] = val;
    }
  }
  return merged;
}
