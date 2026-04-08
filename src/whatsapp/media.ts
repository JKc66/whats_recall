import { downloadMediaMessage, WAMessage, downloadContentFromMessage } from '@whiskeysockets/baileys';
import { writeFile } from 'fs/promises';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { getDb, getDataDir } from '../db/database.ts';
import { log } from '../logger.ts';

function getMediaDir() {
  return process.env.MEDIA_DIR || join(getDataDir(), 'media');
}

const SUBDIR_MAP: Record<string, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
  ptt: 'audio',
  sticker: 'stickers',
  ptv: 'videos',
  lottieSticker: 'stickers',
  document: 'documents'
};

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
    worker.postMessage({ id, buffer: buffer.buffer });
  });
}

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function downloadMedia(message: WAMessage, type: string, sock?: any): Promise<{ path: string, sha256hex: string | null } | null> {
  const db = getDb();
  try {
    const mType = type.endsWith('Message') ? type : type + 'Message';
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
      const candidates = db.getMediaBySha256(sha256hex);
      for (const existing of candidates) {
        const fullPath = join(getMediaDir(), existing.media_path);
        if (existsSync(fullPath)) {
          log('MEDIA', `Reusing existing media for SHA256: ${sha256hex.slice(0, 8)}…`);
          return { path: existing.media_path, sha256hex };
        }
      }
      log('MEDIA', `Deduplication suggested for ${sha256hex.slice(0, 8)} but no valid file found. Proceeding to download...`);
    }

    let buffer: Buffer;
    try {
      buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        { 
          logger: { level: 'silent' } as any,
          reuploadRequest: sock?.updateMediaMessage
        }
      ) as Buffer;
    } catch (_err) {
      log('MEDIA', `Standard direct download failed for ${type}, attempting manual fallback...`);
      // Manual fallback using low-level content downloader for types like lottieSticker
      const bType = (type === 'lottieSticker' ? 'sticker' : (type === 'ptv' ? 'video' : type)) as any;
      const stream = await downloadContentFromMessage(mediaObj, bType);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    }

    if (!buffer || buffer.length === 0) return null;

    // Verify SHA256 if not provided in message (offloaded to worker)
    if (!sha256hex) {
      sha256hex = await computeHash(buffer);
      const candidates = db.getMediaBySha256(sha256hex);
      for (const existing of candidates) {
        const fullPath = join(getMediaDir(), existing.media_path);
        if (existsSync(fullPath)) {
          log('MEDIA', `Reusing existing media for calculated SHA256: ${sha256hex.slice(0, 8)}…`);
          return { path: existing.media_path, sha256hex };
        }
      }
    }

    const subdir = SUBDIR_MAP[type] || 'others';
    const prefixMap: Record<string, string> = {
      image: 'img_',
      video: 'vid_',
      audio: 'aud_',
      ptt: 'ptt_',
      sticker: 'stk_',
      ptv: 'ptv_',
      document: 'doc_'
    };
    const prefix = prefixMap[type] || 'med_';
    const hashPart = sha256hex ? sha256hex.slice(0, 16) : crypto.randomUUID();
    const filename = `${prefix}${hashPart}`;
    const extension = getExtension(type);
    const relativePath = `${subdir}/${filename}.${extension}`;
    const fullPath = join(getMediaDir(), relativePath);

    ensureDir(fullPath);
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
    ptv: 'mp4',
    lottieSticker: 'webp',
    document: 'bin'
  };
  return map[type] || 'bin';
}

export async function downloadProfilePic(jid: string, sock: any): Promise<{ filename: string, isNew: boolean } | null> {
  const db = getDb();
  // Check if we already have it in DB
  const existingPath = db.getChatProfilePic(jid);
  if (existingPath) {
    const fullPath = join(getMediaDir(), existingPath);
    if (existsSync(fullPath)) return { filename: existingPath, isNew: false };
  }

  try {
    const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
    if (!url) return null;

    const res = await fetch(url);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const sha256hex = await computeHash(buffer);

    // Check for deduplication by SHA256 in messages (might be the same image)
    const candidates = db.getMediaBySha256(sha256hex);
    for (const existingMedia of candidates) {
      if (existingMedia.media_path.startsWith('images/') || existingMedia.media_path.startsWith('profile/')) {
        const fullPath = join(getMediaDir(), existingMedia.media_path);
        if (existsSync(fullPath)) {
          log('MEDIA', `Reusing existing media for profile pic: ${sha256hex.slice(0, 8)}…`);
          db.updateChatProfilePic(jid, existingMedia.media_path);
          return { filename: existingMedia.media_path, isNew: false };
        }
      }
    }

    const filename = `profile/dp_${sha256hex.slice(0, 16)}.jpg`;
    const fullPath = join(getMediaDir(), filename);

    // Check if file already exists on disk (but not found in messages table)
    if (existsSync(fullPath)) {
      db.updateChatProfilePic(jid, filename);
      return { filename, isNew: false };
    }

    ensureDir(fullPath);
    await writeFile(fullPath, buffer);
    db.updateChatProfilePic(jid, filename);
    return { filename, isNew: true };
  } catch (e: any) {
    log('MEDIA', `Error downloading profile picture for ${jid}: ${e.message}`);
    return null;
  }
}

