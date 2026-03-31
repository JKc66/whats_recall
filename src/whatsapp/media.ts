import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getDb, MEDIA_DIR } from '../db/database.js';
import { log } from '../logger.js';


const db = getDb();
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
  const id = Math.random().toString(36).slice(2);
  const worker = getHashWorker();
  return new Promise((resolve) => {
    hashPending.set(id, resolve);
    worker.postMessage({ id, buffer: buffer.buffer }, [buffer.buffer]);
  });
}

export async function downloadMedia(message: WAMessage, type: string, sock?: any): Promise<{ path: string, sha256hex: string | null } | null> {
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

    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const extension = getExtension(type);
    const relativePath = `${filename}.${extension}`;
    const fullPath = join(MEDIA_DIR, relativePath);

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
