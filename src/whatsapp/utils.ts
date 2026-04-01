import { isJidGroup } from '@whiskeysockets/baileys';
import { log } from '../logger.ts';
import { syncService } from './sync.ts';

/**
 * Extracts the numerical or ID portion of a WhatsApp JID.
 */
export function extractJidId(jid: string | null | undefined): string {
  if (!jid) return '';
  return jid.split('@')[0];
}

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
