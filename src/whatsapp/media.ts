import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getDb, getDataDir } from '../db/database.js';
import { log } from '../logger.js';

function getMediaDir() {
  return process.env.MEDIA_DIR || join(getDataDir(), 'media');
}


let hashWorker: Worker | null = null;
const hashPending = new Map<string, (hash: string) => void>();

function getHashWorker() {
  if (!hashWorker) {
    hashWorker = new Worker(new URL("../workers/media-worker.ts", import.meta.url).href);
    hashWorker.onmessage = (event) => {
      const { id, hash, error: _error } = event.data;
      const resolve = hashPending.get(id);
      if (resolve) {
        resolve(hash || null);
        hashPending.delete(id);
      }
    };
  }
  return hashWorker;
}

async function computeHash(buffer: Buffer): Promise<string> {
  const id = crypto.randomUUID();
  const worker = getHashWorker();
  return new Promise((resolve) => {
    hashPending.set(id, resolve);
    worker.postMessage({ id, buffer: buffer.buffer }, [buffer.buffer]);
  });
}

export async function downloadMedia(message: WAMessage, type: string, sock?: any): Promise<{ path: string, sha256hex: string | null } | null> {
  const db = getDb();
  try {
    const mType = type + 'Message';
    const msg = message.message as any;
    const mediaObj = msg?.[mType] || 
                    msg?.ephemeralMessage?.message?.[mType] || 
                    msg?.viewOnceMessage?.message?.[mType] || 
                    msg?.viewOnceMessageV2?.message?.[mType] || 
                    msg?.viewOnceMessageV2Extension?.message?.[mType] ||
                    msg?.documentWithCaptionMessage?.message?.[mType];
    
    if (!mediaObj) return null;

    // Check for deduplication by SHA256 if provided by WhatsApp
    let sha256hex: string | null = null;
    if (mediaObj.fileSha256) {
      sha256hex = Buffer.from(mediaObj.fileSha256).toString('hex');
      const existing = db.getMediaBySha256(sha256hex);
      if (existing) {
        log('MEDIA', `Reusing existing media for SHA256: ${sha256hex.slice(0, 8)}…`);
        return { path: existing.media_path, sha256hex };
      }
    }

    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { 
        logger: { level: 'silent' } as any,
        reuploadRequest: sock?.updateMediaMessage
      }
    ) as Buffer;

    if (!buffer) return null;

    // Verify SHA256 if not provided in message (offloaded to worker)
    if (!sha256hex) {
      sha256hex = await computeHash(buffer);
      const existing = db.getMediaBySha256(sha256hex);
      if (existing) {
        log('MEDIA', `Reusing existing media for calculated SHA256: ${sha256hex.slice(0, 8)}…`);
        return { path: existing.media_path, sha256hex };
      }
    }

    const filename = crypto.randomUUID();
    const extension = getExtension(type);
    const relativePath = `${filename}.${extension}`;
    const fullPath = join(getMediaDir(), relativePath);

    await writeFile(fullPath, buffer);
    return { path: relativePath, sha256hex };
  } catch (err: any) {
    log('MEDIA', `Failed to download media: ${err.message}`);
    return null;
  }
}

function getExtension(type: string): string {
  const map: Record<string, string> = {
    image: 'jpg',
    video: 'mp4',
    audio: 'ogg',
    ptt: 'ogg',
    sticker: 'webp',
    document: 'bin'
  };
  return map[type] || 'bin';
}

export async function downloadProfilePic(jid: string, sock: any): Promise<{ filename: string, isNew: boolean } | null> {
  const db = getDb();
  // Check if we already have it (this helper handles DB check, disk check, and self-healing)
  const existing = db.getChatProfilePic(jid);
  if (existing) return { filename: existing, isNew: false };

  try {
    const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
    if (!url) return null;

    const filename = `dp_${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const filepath = join(getMediaDir(), filename);
    const res = await fetch(url);
    if (!res.ok) return null;

    await writeFile(filepath, Buffer.from(await res.arrayBuffer()));
    db.updateChatProfilePic(jid, filename);
    return { filename, isNew: true };
  } catch (e: any) {
    log('MEDIA', `Error downloading profile picture for ${jid}: ${e.message}`);
    return null;
  }
}
