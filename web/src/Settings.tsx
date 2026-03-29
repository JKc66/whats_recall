import { fetchWhatsAppChats, fetchMonitored, addMonitored, removeMonitored, setNotifyEnabled, clearData, fetchSettings, updateSetting, fetchPairingStatus, resetWhatsApp } from './api';
import { stats, setStats, setView, setChats, setMessages, setCurrentChatId, showOnlyDeleted, setShowOnlyDeleted } from './store';
import { notify } from './notify';
import type { WhatsAppChat, MonitoredChat } from './types';
import { avatarColor, getInitials, extractPhone, profilePicUrl } from './utils';
import { createSignal, createResource, Show, For, onCleanup, createEffect } from 'solid-js';

export default function Settings() {
  const [search, setSearch] = createSignal('');
  const [tab, setTab] = createSignal<'monitored' | 'available' | 'config'>('config');
  const [monitored, { refetch: refetchMonitored }] = createResource(fetchMonitored);
  const [available, { refetch: refetchAvailable }] = createResource(fetchWhatsAppChats);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [clearing, setClearing] = createSignal(false);
  const [clearPassword, setClearPassword] = createSignal('');

  const [config, { refetch: refetchConfig }] = createResource(fetchSettings);
  const [savingConfig, setSavingConfig] = createSignal<string | null>(null);
  const [pairing, { refetch: refetchPairing, mutate: mutatePairing }] = createResource(fetchPairingStatus);
  const [showResetNotice, setShowResetNotice] = createSignal(false);
  const [isWaitingForPairing, setIsWaitingForPairing] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<'recent' | 'name'>('recent');
  const [filterType, setFilterType] = createSignal<'all' | 'chats' | 'contacts'>('chats');

  createEffect(() => {
    // When the status changes to connected, dynamically refetch the lists
    if (stats().connected) {
      refetchAvailable();
      refetchMonitored();
    }
  });

  onCleanup(() => clearInterval(pairingInterval));
  const pairingInterval = setInterval(() => {
    // Only poll for pairing info if we are actually waiting for data, NOT if we have an unapplied notice
    // and ONLY if we are actively waiting for a code/QR to be generated or if it's already generated and we're waiting for scan
    if (tab() === 'config' && !stats().connected && !showResetNotice() && (isWaitingForPairing() || pairing()?.data)) {
      refetchPairing();
    }
  }, 5000);

  const monitoredIds = () => new Set((monitored() || []).map((m) => m.chat_id));

  const filteredAvailable = () => {
    const q = search().toLowerCase().trim();
    let list = [...(available() || [])];

    if (filterType() === 'chats') {
      list = list.filter(c => c.isGroup || (c.timestamp && c.timestamp > 0));
    } else if (filterType() === 'contacts') {
      list = list.filter(c => !c.isGroup && (!c.timestamp || c.timestamp === 0));
    }

    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || extractPhone(c.id).includes(q));

    if (sortBy() === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
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
      if (config()) {
        await handleConfigUpdate('whatsapp_notify', next.toString());
      } else {
        await setNotifyEnabled(next);
      }
    } catch {
      setStats((s) => ({ ...s, notifyEnabled: !next }));
    }
  }

  async function handleConfigUpdate(key: string, value: string) {
    if (config() && config()![key] === value) return; // Ignore if no change
    setSavingConfig(key);
    try {
      await updateSetting(key, value);
      await refetchConfig();
      if (key === 'whatsapp_notify') {
        setStats(s => ({ ...s, notifyEnabled: value === 'true' }));
      }
      if (key === 'whatsapp_phone' || key === 'whatsapp_pairing_method') {
        setShowResetNotice(true);
        setIsWaitingForPairing(false);
        // Wipe local pairing data state so it doesn't accidentally trigger the polling loop
        mutatePairing({ type: null, data: null, connected: false, authenticated: false } as any);
      }
      notify.success('Setting saved', `${key.replace(/_/g, ' ')} updated successfully.`);
    } catch {
      notify.warning('Save failed', 'Something went wrong.');
    } finally {
      setSavingConfig(null);
    }
  }

  async function handleReset() {
    const isLogOutOnly = !!pairing()?.authenticated && !showResetNotice();

    if (pairing()?.authenticated || pairing()?.data) {
      if (!confirm('Are you sure? This will log you out of the current WhatsApp session and clear its cache.')) return;
    }
    setBusy('reset_wa');
    try {
      await resetWhatsApp(!isLogOutOnly);
      await refetchPairing();
      setShowResetNotice(false);
      setIsWaitingForPairing(!isLogOutOnly);

      if (isLogOutOnly) {
        notify.success('Logged out', 'Session cleared successfully.');
      } else {
        notify.success('Session reset', 'Waiting for new pairing...');
      }
    } catch {
      notify.warning('Reset failed', 'Could not reset session.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="settings">
      <header class="settings-top">
        <div class="settings-title-row">
          <button class="icon-btn settings-back" onClick={() => setView('chats')} title="Back" aria-label="Back to chats">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2>Settings</h2>
        </div>
        <p>Manage monitored chats and notification preferences.</p>
      </header>

      <div class="settings-search">
        <input
          type="text"
          placeholder="Search chats…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
        />
      </div>

      <div class="settings-tabs">
        <button class="pill" classList={{ active: tab() === 'config' }} onClick={() => setTab('config')}>
          Configuration
        </button>
        <button class="pill" classList={{ active: tab() === 'monitored' }} onClick={() => setTab('monitored')}>
          Monitored ({(monitored() || []).length})
        </button>
        <button class="pill" classList={{ active: tab() === 'available' }} onClick={() => setTab('available')}>
          Available ({(available() || []).length})
        </button>
      </div>

      <Show when={tab() === 'config'}>
        <div class="settings-list">
          <div class="config-section">
            <h3 class="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.58 16.11a7 7 0 0 1 6.84 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
              Connectivity
            </h3>

            <div class={`pairing-card ${pairing()?.authenticated ? 'connected' : 'disconnected'}`}>
              <div class="pairing-status-pill">
                <span class="indicator" />
                <span class="pairing-status-text">
                  {pairing()?.authenticated
                    ? 'Authenticated & Connected'
                    : ((config()?.whatsapp_pairing_method || 'code') === 'code' && !config()?.whatsapp_phone && !pairing()?.data
                      ? 'Not Initialized'
                      : 'Waiting for pairing...')}
                </span>
              </div>

              <Show when={!pairing()?.authenticated}>
                <div class="pairing-box">
                  <Show when={pairing()?.type === 'qr'}>
                    <div class="qr-container">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(pairing()?.data || '')}&size=200x200`} alt="Scan to pair" />
                      <p>Scan this QR code with WhatsApp on your phone</p>
                    </div>
                  </Show>
                  <Show when={pairing()?.type === 'code'}>
                    <div class="code-container">
                      <div class="code-label">AUTH_CODE</div>
                      <div class="pairing-code">{pairing()?.data || 'GENERATING'}</div>
                      <p>Enter this code in WhatsApp (Link a device → Link with phone number)</p>
                    </div>
                  </Show>
                  <Show when={!pairing()?.data}>
                    <Show when={busy() === 'reset_wa' || isWaitingForPairing()} fallback={
                      <div class="pairing-loading" style="opacity: 0.8; flex-direction: column; gap: 4px;">
                        <div>Not started</div>
                        <span style="font-size: 0.9em; text-align: center;">Click "Link New Device" to start pairing.</span>
                      </div>
                    }>
                      <div class="pairing-loading">
                        <div class="spinner" />
                        <span>Generating {(config()?.whatsapp_pairing_method || 'code') === 'qr' ? 'QR code' : 'pairing code'}. Please hold on...</span>
                      </div>
                    </Show>
                  </Show>
                </div>
              </Show>

              <div class="pairing-actions">
                <Show when={showResetNotice()}>
                  <div class="config-alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    Settings changed. Click below to apply.
                  </div>
                </Show>
                <button class="btn-outline sm" classList={{ 'btn-primary-lite': showResetNotice() }} onClick={handleReset} disabled={!!busy()}>
                  {pairing()?.authenticated
                    ? (showResetNotice() ? 'Apply Changes & Reset' : 'Log Out')
                    : 'Link New Device'
                  }
                </button>
              </div>
            </div>

            <div class="config-item">
              <label>Pairing Mechanism</label>
              <div class="config-tags">
                <button
                  class="tag"
                  classList={{ active: (config()?.whatsapp_pairing_method || 'code') === 'qr' }}
                  onClick={() => handleConfigUpdate('whatsapp_pairing_method', 'qr')}
                >QR Code</button>
                <button
                  class="tag"
                  classList={{ active: (config()?.whatsapp_pairing_method || 'code') === 'code' }}
                  onClick={() => handleConfigUpdate('whatsapp_pairing_method', 'code')}
                >Phone Pairing Code</button>
              </div>
            </div>

            <div class="config-item">
              <label for="whatsapp_phone">WhatsApp Phone Number</label>
              <div class="config-input-row">
                <input
                  id="whatsapp_phone"
                  type="text"
                  placeholder="+123456789 (With country code)"
                  value={config()?.whatsapp_phone || ''}
                  onBlur={(e) => handleConfigUpdate('whatsapp_phone', e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfigUpdate('whatsapp_phone', e.currentTarget.value)}
                  disabled={!!savingConfig()}
                  aria-label="WhatsApp phone setting"
                />
                <Show when={savingConfig() === 'whatsapp_phone'}>
                  <div class="spinner sm" />
                </Show>
              </div>
              <p class="config-hint">Changing this will clear the current session and restart the pair process.</p>
            </div>

            <h3 class="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              Preferences
            </h3>
            <div class="config-item">
              <div class="toggle-row no-pad">
                <div>
                  <div class="toggle-label" id="notify-label">Forward deletions to WhatsApp</div>
                  <div class="toggle-sublabel" id="notify-desc">Send yourself a message when someone deletes a message</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" checked={config() ? config()?.whatsapp_notify === 'true' : stats().notifyEnabled} onChange={toggleNotify} aria-labelledby="notify-label" aria-describedby="notify-desc" />
                  <span class="toggle-track" />
                </label>
              </div>
            </div>

            <div class="config-item">
              <div class="toggle-row no-pad">
                <div>
                  <div class="toggle-label" id="deleted-label">Show only deleted messages</div>
                  <div class="toggle-sublabel" id="deleted-desc">Only list messages that have been explicitly deleted in Chat</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" checked={showOnlyDeleted()} onChange={(e) => setShowOnlyDeleted(e.currentTarget.checked)} aria-labelledby="deleted-label" aria-describedby="deleted-desc" />
                  <span class="toggle-track" />
                </label>
              </div>
            </div>


          </div>
        </div>
      </Show>

      <Show when={tab() === 'monitored'}>
        <div class="settings-list">
          <Show when={(monitored() || []).length === 0 && !monitored.loading}>
            <div class="list-empty">
              <p>No chats monitored yet.</p>
              <p>Switch to <strong>Available</strong> to add chats.</p>
            </div>
          </Show>
          <Show when={monitored.loading}>
            <div class="list-loading"><div class="spinner" /> Loading…</div>
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
                    <Show when={chat.lid}>
                      <div class="meta-phone meta-lid">{chat.lid}</div>
                    </Show>
                    <div class="meta-text">{chat.is_group ? 'Group' : 'Private'}</div>
                  </div>
                  <button class="btn-remove" disabled={busy() === chat.chat_id} onClick={() => handleRemove(chat.chat_id)}>
                    {busy() === chat.chat_id ? 'Removing…' : 'Remove'}
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
            <p>Go to the <strong>Configuration</strong> tab to pair your device.</p>
          </div>
        </Show>
        <Show when={stats().connected}>
          <div class="sort-bar">
            <span class="sort-label">Show:</span>
            <button class="pill xs" classList={{ active: filterType() === 'all' }} onClick={() => setFilterType('all')}>All</button>
            <button class="pill xs" classList={{ active: filterType() === 'chats' }} onClick={() => setFilterType('chats')}>Chats</button>
            <button class="pill xs" classList={{ active: filterType() === 'contacts' }} onClick={() => setFilterType('contacts')}>Contacts</button>

            <span class="sort-label ml-2">Sort by:</span>
            <button class="pill xs" classList={{ active: sortBy() === 'recent' }} onClick={() => setSortBy('recent')}>Recent</button>
            <button class="pill xs" classList={{ active: sortBy() === 'name' }} onClick={() => setSortBy('name')}>A-Z</button>

            <div class="flex-1"></div>
            <button class="icon-btn xs ml-auto p-1" onClick={() => refetchAvailable()} title="Refresh chats" aria-label="Refresh chats list">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={available.loading ? 'spin-icon' : ''}>
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div class="settings-list">
            <Show when={available.loading}>
              <div class="list-loading"><div class="spinner" /> Loading chats from WhatsApp…</div>
            </Show>
            <For each={filteredAvailable()}>
              {(chat) => {
                const isAdded = () => monitoredIds().has(chat.id);
                const phone = () => !chat.isGroup ? extractPhone(chat.id) : '';
                return (
                  <div class="settings-item">
                    <Show when={profilePicUrl(chat.profilePic)} fallback={
                      <div class="avatar sm" style={{ background: avatarColor(chat.name) }}>
                        {getInitials(chat.name)}
                      </div>
                    }>
                      <div class="avatar sm avatar-dp" style={{ background: avatarColor(chat.name) }}>
                        <span class="avatar-initials">{getInitials(chat.name)}</span>
                        <img class="avatar-img" src={profilePicUrl(chat.profilePic)!} alt="" width="34" height="34" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    </Show>
                    <div class="settings-item-info">
                      <div class="name">{chat.name}</div>
                      <Show when={phone() && chat.name !== phone()}>
                        <div class="meta-phone">{phone()}</div>
                      </Show>
                      <Show when={chat.lid}>
                        <div class="meta-phone meta-lid">{chat.lid}</div>
                      </Show>
                      <div class="meta-text">{chat.isGroup ? 'Group' : 'Private'}</div>
                    </div>
                    <Show when={isAdded()} fallback={
                      <button class="btn-add" disabled={busy() === chat.id} onClick={() => handleAdd(chat)}>
                        {busy() === chat.id ? 'Adding…' : 'Add'}
                      </button>
                    }>
                      <button class="btn-remove" disabled={busy() === chat.id} onClick={() => handleRemove(chat.id)}>
                        {busy() === chat.id ? 'Removing…' : 'Remove'}
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
        <h3 class="section-title" style="margin-top: 0; color: var(--red);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          Danger zone
        </h3>
        <div class="danger-item">
          <div>
            <div class="toggle-label">Clear all data</div>
            <div class="toggle-sublabel">Delete all stored messages, media, and chat history. This cannot be undone.</div>
          </div>
          <button class="btn-danger" disabled={clearing()} onClick={handleClearData}>
            {clearing() ? 'Clearing…' : 'Clear Data'}
          </button>
        </div>
        <Show when={confirmClear()}>
          <div class="danger-confirm">
            <p>Enter your password to confirm permanent deletion of all data.</p>
            <input
              type="password"
              class="danger-password"
              placeholder="Enter password…"
              value={clearPassword()}
              onInput={(e) => setClearPassword(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmClearData()}
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
