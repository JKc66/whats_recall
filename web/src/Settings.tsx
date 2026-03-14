import { createSignal, createResource, Show, For } from 'solid-js';
import { fetchWhatsAppChats, fetchMonitored, addMonitored, removeMonitored, setNotifyEnabled, clearData } from './api';
import { stats, setStats, setView, setChats, setMessages, setCurrentChatId } from './store';
import { notify } from './notify';
import type { WhatsAppChat, MonitoredChat } from './types';
import { avatarColor, getInitials, extractPhone, profilePicUrl } from './utils';

export default function Settings() {
  const [search, setSearch] = createSignal('');
  const [tab, setTab] = createSignal<'monitored' | 'available'>('monitored');
  const [monitored, { refetch: refetchMonitored }] = createResource(fetchMonitored);
  const [available, { refetch: refetchAvailable }] = createResource(fetchWhatsAppChats);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [clearing, setClearing] = createSignal(false);
  const [clearPassword, setClearPassword] = createSignal('');

  const monitoredIds = () => new Set((monitored() || []).map((m) => m.chat_id));

  const filteredAvailable = () => {
    const q = search().toLowerCase().trim();
    let list = available() || [];
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || extractPhone(c.id).includes(q));
    return list;
  };

  const filteredMonitored = () => {
    const q = search().toLowerCase().trim();
    let list = monitored() || [];
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || extractPhone(c.chat_id).includes(q));
    return list;
  };

  async function handleAdd(chat: WhatsAppChat) {
    setBusy(chat.id);
    try {
      await addMonitored(chat.id, chat.name, chat.isGroup);
      refetchMonitored();
      refetchAvailable();
    } finally { setBusy(null); }
  }

  async function handleRemove(chatId: string) {
    setBusy(chatId);
    try {
      await removeMonitored(chatId);
      refetchMonitored();
      refetchAvailable();
    } finally { setBusy(null); }
  }

  function handleClearData() {
    setClearPassword('');
    setConfirmClear(true);
  }

  async function confirmClearData() {
    if (!clearPassword()) {
      notify.warning('Password required', 'Enter your password to confirm.');
      return;
    }
    setClearing(true);
    setConfirmClear(false);
    try {
      await clearData(clearPassword());
      setChats([]);
      setMessages([]);
      setCurrentChatId(null);
      setStats((s) => ({ ...s, totalMessages: 0, deletedMessages: 0, totalChats: 0 }));
      notify.success('Data cleared', 'All messages and chat data have been deleted.');
    } catch {
      notify.warning('Failed to clear data', 'Wrong password or something went wrong.');
    } finally {
      setClearing(false);
      setClearPassword('');
    }
  }

  async function toggleNotify() {
    const next = !stats().notifyEnabled;
    setStats((s) => ({ ...s, notifyEnabled: next }));
    try {
      await setNotifyEnabled(next);
    } catch {
      setStats((s) => ({ ...s, notifyEnabled: !next }));
    }
  }

  return (
    <div class="settings">
      <header class="settings-top">
        <div class="settings-title-row">
          <button class="icon-btn settings-back" onClick={() => setView('chats')} title="Back" aria-label="Back to chats">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2>Settings</h2>
        </div>
        <p>Manage monitored chats and notification preferences.</p>
      </header>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">Forward deletions to WhatsApp</div>
          <div class="toggle-sublabel">Send yourself a message when someone deletes a message</div>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={stats().notifyEnabled} onChange={toggleNotify} aria-label="Forward deletions toggle" />
          <span class="toggle-track" />
        </label>
      </div>

      <div class="settings-search">
        <input
          type="text"
          placeholder="Search chats\u2026"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
        />
      </div>

      <div class="settings-tabs">
        <button class="pill" classList={{ active: tab() === 'monitored' }} onClick={() => setTab('monitored')}>
          Monitored ({(monitored() || []).length})
        </button>
        <button class="pill" classList={{ active: tab() === 'available' }} onClick={() => setTab('available')}>
          Available
        </button>
      </div>

      <Show when={tab() === 'monitored'}>
        <div class="settings-list">
          <Show when={(monitored() || []).length === 0 && !monitored.loading}>
            <div class="list-empty">
              <p>No chats monitored yet.</p>
              <p>Switch to <strong>Available</strong> to add chats.</p>
            </div>
          </Show>
          <Show when={monitored.loading}>
            <div class="list-loading"><div class="spinner" /> Loading\u2026</div>
          </Show>
          <For each={filteredMonitored()}>
            {(chat) => {
              const phone = () => !chat.is_group ? extractPhone(chat.chat_id) : '';
              return (
                <div class="settings-item">
                  <div class="avatar sm" style={{ background: avatarColor(chat.name) }}>
                    {getInitials(chat.name)}
                  </div>
                  <div class="settings-item-info">
                    <div class="name">{chat.name}</div>
                    <Show when={phone() && chat.name !== phone()}>
                      <div class="meta-phone">{phone()}</div>
                    </Show>
                    <div class="meta-text">{chat.is_group ? 'Group' : 'Private'}</div>
                  </div>
                  <button class="btn-remove" disabled={busy() === chat.chat_id} onClick={() => handleRemove(chat.chat_id)}>
                    {busy() === chat.chat_id ? '\u2026' : 'Remove'}
                  </button>
                </div>
              );
            }}
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
              <div class="list-loading"><div class="spinner" /> Loading chats from WhatsApp\u2026</div>
            </Show>
            <For each={filteredAvailable()}>
              {(chat) => {
                const isAdded = () => monitoredIds().has(chat.id);
                const phone = () => !chat.isGroup ? extractPhone(chat.id) : '';
                return (
                  <div class="settings-item">
                    <div class="avatar sm" style={{ background: avatarColor(chat.name) }}>
                      {getInitials(chat.name)}
                    </div>
                    <div class="settings-item-info">
                      <div class="name">{chat.name}</div>
                      <Show when={phone() && chat.name !== phone()}>
                        <div class="meta-phone">{phone()}</div>
                      </Show>
                      <div class="meta-text">{chat.isGroup ? 'Group' : 'Private'}</div>
                    </div>
                    <Show when={isAdded()} fallback={
                      <button class="btn-add" disabled={busy() === chat.id} onClick={() => handleAdd(chat)}>
                        {busy() === chat.id ? '\u2026' : 'Add'}
                      </button>
                    }>
                      <button class="btn-remove" disabled={busy() === chat.id} onClick={() => handleRemove(chat.id)}>
                        {busy() === chat.id ? '\u2026' : 'Remove'}
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

      <div class="settings-danger-zone">
        <h3>Danger zone</h3>
        <div class="danger-item">
          <div>
            <div class="toggle-label">Clear all data</div>
            <div class="toggle-sublabel">Delete all stored messages, media, and chat history. This cannot be undone.</div>
          </div>
          <button class="btn-danger" disabled={clearing()} onClick={handleClearData}>
            {clearing() ? 'Clearing\u2026' : 'Clear Data'}
          </button>
        </div>
        <Show when={confirmClear()}>
          <div class="danger-confirm">
            <p>Enter your password to confirm permanent deletion of all data.</p>
            <input
              type="password"
              class="danger-password"
              placeholder="Enter password\u2026"
              value={clearPassword()}
              onInput={(e) => setClearPassword(e.currentTarget.value)}
              aria-label="Confirm password for data deletion"
              autofocus
            />
            <div class="danger-confirm-actions">
              <button class="btn-danger" disabled={!clearPassword()} onClick={confirmClearData}>Yes, delete everything</button>
              <button class="btn-cancel" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
