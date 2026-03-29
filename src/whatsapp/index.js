import WS from 'ws';
import { WhatsAppMonitor } from './WhatsAppMonitor.js';

// Patch ws to suppress Bun warnings for unimplemented events
const originalOn = WS.prototype.on;
WS.prototype.on = function (event) {
  if (event === 'upgrade' || event === 'unexpected-response') return this;
  return originalOn.apply(this, arguments);
};

export function createMonitor(db, broadcast) {
  const monitor = new WhatsAppMonitor(db, broadcast);

  return {
    client: monitor.client,
    start: () => monitor.start(),
    isReady: () => monitor.isReady(),
    isAuthenticated: () => monitor.isAuthenticated(),
    getMyId: () => monitor.getMyId(),
    getWhatsAppChats: () => monitor.getWhatsAppChats(),
    deleteChatFully: (chatId) => monitor.deleteChatFully(chatId),
    getNotifyEnabled: () => monitor.getNotifyEnabled(),
    getPairingStatus: () => monitor.getPairingStatus(),
    resetWhatsAppSession: (requestPairing) => monitor.resetWhatsAppSession(requestPairing),
    setNotifyEnabled: (enabled) => monitor.setNotifyEnabled(enabled)
  };
}
