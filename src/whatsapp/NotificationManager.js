import { log } from '../logger.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { MEDIA_DIR } from '../database.js';

export class NotificationManager {
  constructor(monitor) {
    this.monitor = monitor;
  }

  async sendViewOnceNotification(msg, chatName) {
    try {
      if (!this.monitor.client || !this.monitor.myId) return;

      const from = msg.sender_name || 'Unknown';
      const mType = msg.type ? msg.type.toUpperCase() : 'MEDIA';
      const text = `👁️ *View-Once* from *${from}* (${chatName}) [${mType}]`;

      if (msg.has_media && msg.media_path) {
        const fullPath = join(MEDIA_DIR, msg.media_path);
        if (existsSync(fullPath)) {
          const content = { caption: text };
          if (msg.type === 'image') content.image = { url: fullPath };
          else if (msg.type === 'video') content.video = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await this.monitor.client.sendMessage(this.monitor.myId, content);
          log('WA', `Sent view-once notification for ${msg.message_id}`);
        }
      }
    } catch (err) {
      log('WA', `Failed to send view-once notification: ` + err.message);
    }
  }

  async sendDeletionNotification(msg, chatName) {
    try {
      if (!this.monitor.client || !this.monitor.myId) return;

      const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const from = msg.sender_name || 'Unknown';
      const mType = msg.type !== 'chat' && msg.type ? ` [${msg.type.toUpperCase()}]` : '';

      const text = [
        `🗑️ *Deleted* from *${from}* (${chatName}) at ${time}${mType}:`,
        msg.body ? `> ${msg.body}` : (msg.has_media ? '' : '_No text content_')
      ].filter(r => r !== '').join('\n');

      if (msg.has_media && msg.media_path) {
        const fullPath = join(MEDIA_DIR, msg.media_path);
        if (existsSync(fullPath)) {
          const mediaType = msg.type;
          const content = { caption: text };

          if (mediaType === 'image') content.image = { url: fullPath };
          else if (mediaType === 'video') content.video = { url: fullPath };
          else if (mediaType === 'audio') {
            content.audio = { url: fullPath };
            content.mimetype = 'audio/ogg; codecs=opus';
            content.ptt = true;
          }
          else if (mediaType === 'sticker') content.sticker = { url: fullPath };
          else content.document = { url: fullPath, fileName: msg.media_filename || 'media' };

          await this.monitor.client.sendMessage(this.monitor.myId, content);
          log('WA', `Sent media deletion notification for ${msg.message_id}`);
          return;
        }
      }

      await this.monitor.client.sendMessage(this.monitor.myId, { text });
      log('WA', `Sent deletion notification for ${msg.message_id}`);
    } catch (err) {
      log('WA', `Failed to send deletion notification: ` + err.message);
    }
  }
}
