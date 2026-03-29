import { join } from 'path';
import { writeFile } from 'fs/promises';
import { MEDIA_DIR } from '../database.js';
import { log } from '../logger.js';
import pino from 'pino';
import { downloadMediaMessage, getContentType, extractMessageContent } from '@whiskeysockets/baileys';

export class MediaHandler {
  constructor(db, monitor) {
    this.db = db;
    this.monitor = monitor;
  }

  async downloadAndSaveMedia(messageContent, msg = null) {
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

      if (!mediaType || !mediaData) {
        log('WA', `Download failed: Could not determine data container for type ${mType}`);
        return null;
      }

      // Handle deduplication by SHA256
      let sha256hex = null;
      if (mediaData.fileSha256) {
        sha256hex = Buffer.from(mediaData.fileSha256).toString('hex');
        const existing = this.db.getMediaBySha256(sha256hex);
        if (existing) {
          log('WA', `Reusing existing media for SHA256: ${sha256hex.slice(0, 8)}…`);
          return {
            mediaPath: existing.media_path,
            mediaType: existing.media_type,
            mediaFilename: existing.media_filename,
            mediaSha256: sha256hex,
            type: mediaType
          };
        }
      }

      // We use the entire message info for downloadMediaMessage if possible
      const buffer = await downloadMediaMessage(
        { message: messageContent, key: msg?.key },
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: this.monitor.client.updateMediaMessage }
      ).catch(err => {
        log('WA', `Download error: ${err.message}`);
        return null;
      });

      if (!buffer) {
        log('WA', `Download failed: returned empty for ${mediaType}`);
        return null;
      }

      const filename = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
      const filepath = join(MEDIA_DIR, filename);
      await writeFile(filepath, buffer);

      return {
        mediaPath: filename,
        mediaType: mediaData.mimetype || mediaType + '/' + fileExt,
        mediaFilename: mediaData.fileName || filename,
        mediaSha256: sha256hex,
        type: mediaType
      };
    } catch (e) {
      log('WA', 'Failed to download media: ' + e.message);
      return null;
    }
  }
}
