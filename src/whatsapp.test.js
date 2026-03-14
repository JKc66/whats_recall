import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';

// Mock whatsapp-web.js
mock.module('whatsapp-web.js', () => {
  return {
    Client: class Client {
      constructor() {
        this.events = {};
        this.info = { wid: { _serialized: 'my_id_123' } };
      }
      on(event, cb) {
        this.events[event] = cb;
      }
      once(event, cb) {
        this.events[event] = cb;
      }
      initialize() {}
    },
    LocalAuth: class LocalAuth {}
  };
});

describe('whatsapp.js monitor handleMessage', () => {
  let dbMock;
  let broadcastMock;
  let consoleSpy;
  let createMonitor;

  beforeEach(async () => {
    // Dynamic import to ensure the mock is established beforehand
    const wa = await import('./whatsapp.js');
    createMonitor = wa.createMonitor;

    dbMock = {
      isMonitored: mock(() => true),
      upsertChat: mock(),
      saveMessage: mock(),
      getMessage: mock(() => null),
      markDeleted: mock(),
      getChats: mock(() => []),
      getMonitoredChats: mock(() => []),
      getChatProfilePics: mock(() => ({})),
      updateChatProfilePic: mock(),
      getChatProfilePic: mock(() => null),
    };
    broadcastMock = mock();
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log an error when media download fails', async () => {
    const monitor = createMonitor(dbMock, broadcastMock);

    // Extract the client that was created
    const client = monitor.client;

    // Simulate auth so client becomes ready
    if (client.events['ready']) {
      client.events['ready']();
    }

    // In whatsapp.js, the event is 'message_create'
    const messageHandler = client.events['message_create'];
    expect(messageHandler).toBeDefined();

    const mockMessage = {
      type: 'image',
      hasMedia: true,
      from: 'user@c.us',
      to: 'me@c.us',
      id: {
        _serialized: 'false_user@c.us_123',
        remote: 'user@c.us',
        id: '123_pure_hash'
      },
      getChat: mock(() => Promise.resolve({
        id: { _serialized: 'chat123', user: 'chat123' },
        isGroup: false,
      })),
      getContact: mock(() => Promise.resolve({
        id: { _serialized: 'user123' },
        pushname: 'Test User'
      })),
      downloadMedia: mock(() => Promise.reject(new Error('Network error during download'))),
    };

    await messageHandler(mockMessage);

    // Verify it was called with the specific error
    const logCalls = consoleSpy.mock.calls.map(call => call.join(' ')); // join arguments if there are multiple

    const foundErrorLog = logCalls.some(logMsg =>
      typeof logMsg === 'string' &&
      logMsg.includes('[WA]') &&
      logMsg.includes('Media download failed: Network error during download')
    );

    expect(foundErrorLog).toBe(true);
    expect(dbMock.saveMessage).toHaveBeenCalled();
  });
});
