import { getContentType, extractMessageContent } from '@whiskeysockets/baileys';

/**
 * Robustly unwraps a WhatsApp message from any possible wrappers (ephemeral, view-once, etc.)
 * @param {import('@whiskeysockets/baileys').proto.IMessage|null|undefined} message
 * @param {any} [baileysUtils] - optional dependency injection for tests
 */
export function unwrapMessage(message, baileysUtils) {
  if (!message) return { message: null, content: null, type: null, isViewOnce: false };

  const _getContentType = baileysUtils?.getContentType || getContentType;
  const _extractMessageContent = baileysUtils?.extractMessageContent || extractMessageContent;

  let isViewOnce = false;
  let currentMessage = message;
  let type = _getContentType(currentMessage);

  const wrappers = [
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension'
  ];

  while (type && wrappers.includes(type)) {
    if (type.toLowerCase().includes('viewonce')) {
      isViewOnce = true;
    }
    currentMessage = _extractMessageContent(currentMessage);
    type = _getContentType(currentMessage);
  }

  const content = currentMessage && type ? currentMessage[type] : null;

  // Final check for viewOnce in the unwrapped content itself
  // Some messages have the viewOnce property inside the media message itself
  if (content?.viewOnce) {
    isViewOnce = true;
  }

  return {
    message: currentMessage, // The unwrapped IMessage
    content,                 // The specific content of the message type (e.g. imageMessage)
    type,                    // The content type (e.g. 'imageMessage')
    isViewOnce
  };
}
