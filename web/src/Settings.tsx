import { createSignal, createResource, Show, For } from 'solid-js';
import { fetchWhatsAppChats, fetchMonitored, addMonitored, removeMonitored } from './api';
import { stats } from './store';
import type { WhatsAppChat, MonitoredChat } from './types';
import { avatarColor, getInitials } from './utils';

export default function Settings() {
  const [search, setSearch] = createSignal('');
  const [tab, setTab] = createSignal<'monitored' | 'available'>('monitored');
  const [monitored, { refetch: refetchMonitored }] = createResource(fetchMonitored);
  const [available, { refetch: refetchAvailable }] = createResource(fetchWhatsAppChats);
  const [busy, setBusy] = createSignal<string | null>(null);

  const monitoredIds = () => new Set((monitored() || []).map((m) => m.chat_id));

  const filteredAvailable = () => {
    const q = search().toLowerCase().trim();
    let list = available() || [];
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  };

  const filteredMonitored = () => {
    const q = search().toLowerCase().trim();
    let list = monitored() || [];
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  };

  async function handleAdd(chat: WhatsAppChat) {
    setBusy(chat.id);
    try {
      await addMonitored(chat.id, chat.name, chat.isGroup);
      refetchMonitored();
      refetchAvailable();
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(chatId: string) {
    setBusy(chatId);
    try {
      await removeMonitored(chatId);
      refetchMonitored();
      refetchAvailable();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="settings">
      <header class="settings-header">
        <h2>Manage Monitored Chats</h2>
        <p>Add the chats you want to track. Only monitored chats will have their messages cached and deletions detected.</p>
      </header>

      <div class="settings-search">
        <input
          type="text"
          placeholder="Search..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <div class="settings-tabs">
        <button classList={{ active: tab() === 'monitored' }} onClick={() => setTab('monitored')}>
          Monitored ({(monitored() || []).length})
        </button>
        <button classList={{ active: tab() === 'available' }} onClick={() => setTab('available')}>
          Available
        </button>
      </div>

      <Show when={tab() === 'monitored'}>
        <div class="settings-list">
          <Show when={(monitored() || []).length === 0 && !monitored.loading}>
            <div class="list-empty">
              <p>No chats being monitored yet.</p>
              <p>Switch to the <strong>Available</strong> tab to add chats.</p>
            </div>
          </Show>
          <Show when={monitored.loading}>
            <div class="list-loading"><div class="spinner" /> Loading...</div>
          </Show>
          <For each={filteredMonitored()}>
            {(chat) => (
              <div class="settings-item">
                <div class="chat-avatar sm" style={{ background: avatarColor(chat.name) }}>
                  {getInitials(chat.name)}
                </div>
                <div class="settings-item-info">
                  <div class="name">{chat.name}</div>
                  <div class="meta-text">{chat.is_group ? 'Group' : 'Private'}</div>
                </div>
                <button
                  class="btn-remove"
                  disabled={busy() === chat.chat_id}
                  onClick={() => handleRemove(chat.chat_id)}
                >
                  {busy() === chat.chat_id ? '...' : 'Remove'}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={tab() === 'available'}>
        <Show when={!stats().connected}>
          <div class="list-empty">
            <p>WhatsApp is not connected.</p>
            <p>Scan the QR code in the terminal first.</p>
          </div>
        </Show>
        <Show when={stats().connected}>
          <div class="settings-list">
            <Show when={available.loading}>
              <div class="list-loading"><div class="spinner" /> Loading chats from WhatsApp...</div>
            </Show>
            <For each={filteredAvailable()}>
              {(chat) => {
                const isAdded = () => monitoredIds().has(chat.id);
                return (
                  <div class="settings-item">
                    <div class="chat-avatar sm" style={{ background: avatarColor(chat.name) }}>
                      {getInitials(chat.name)}
                    </div>
                    <div class="settings-item-info">
                      <div class="name">{chat.name}</div>
                      <div class="meta-text">{chat.isGroup ? 'Group' : 'Private'}</div>
                    </div>
                    <Show when={isAdded()} fallback={
                      <button
                        class="btn-add"
                        disabled={busy() === chat.id}
                        onClick={() => handleAdd(chat)}
                      >
                        {busy() === chat.id ? '...' : 'Add'}
                      </button>
                    }>
                      <button
                        class="btn-remove"
                        disabled={busy() === chat.id}
                        onClick={() => handleRemove(chat.id)}
                      >
                        {busy() === chat.id ? '...' : 'Remove'}
                      </button>
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={!available.loading && (available() || []).length === 0}>
              <div class="list-empty">No chats available.</div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
