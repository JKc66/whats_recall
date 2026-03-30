import { createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js';
import { logout, fetchMessages, markChatAsRead } from './api';
import {
  chats, setChats, currentChatId, setCurrentChatId, stats,
  view, setView, setAuthenticated, setMessages,
} from './store';
import { avatarColor, getInitials, formatRelativeDate, truncate, extractPhone, profilePicUrl } from './utils';
import type { Chat } from './types';

export default function Sidebar() {
  const [search, setSearch] = createSignal('');
  const [isMobile, setIsMobile] = createSignal(window.innerWidth <= 768);

  onMount(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    onCleanup(() => mq.removeEventListener('change', handler));
  });

  const sidebarHidden = () => {
    if (!isMobile()) return false;
    if (view() === 'settings') return true;
    return !!currentChatId() && view() === 'chats';
  };

  const filteredChats = createMemo(() => {
    let list = chats();
    const q = search().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.last_message_preview || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  async function openChat(chatId: string) {
    setCurrentChatId(chatId);
    setView('chats');

    const chatList = chats();
    const chatToUpdate = chatList.find(c => c.chat_id === chatId);
    if (chatToUpdate && chatToUpdate.deleted_count > 0) {
      setChats(chatList.map(c =>
        c.chat_id === chatId ? { ...c, deleted_count: 0 } : c
      ));
      markChatAsRead(chatId).catch(() => { });
    }

    try {
      const msgs = await fetchMessages(chatId);
      setMessages(msgs);
    } catch { /* handled */ }
  }

  async function handleLogout() {
    await logout();
    setAuthenticated(false);
  }

  return (
    <aside class="sidebar" classList={{ hidden: sidebarHidden() }}>
      <header class="sidebar-header">
        <div class="sidebar-brand">
          <span
            class="status-dot"
            classList={{ on: stats().connected }}
            title={stats().connected ? 'Connected' : stats().authenticated ? 'Initializing…' : 'Disconnected'}
          />
          Monitor
          <Show when={stats().deletedMessages > 0}>
            <span class="brand-badge">{stats().deletedMessages} deleted</span>
          </Show>
        </div>
        <nav class="sidebar-actions" aria-label="Sidebar actions">
          <button
            class="icon-btn"
            classList={{ active: view() === 'settings' }}
            onClick={() => setView(view() === 'settings' ? 'chats' : 'settings')}
            title="Settings"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
          <button class="icon-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>
        </nav>
      </header>

      <div class="sidebar-search">
        <input
          type="text"
          placeholder="Search chats…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
        />
      </div>

      <div class="chat-list">
        <Show when={filteredChats().length > 0} fallback={
          <div class="list-empty">
            {search() ? `No chats matching "${search()}"` : 'No chats found'}
          </div>
        }>
          <For each={filteredChats()}>
            {(chat) => (
              <ChatRow
                chat={chat}
                active={currentChatId() === chat.chat_id}
                onClick={() => openChat(chat.chat_id)}
              />
            )}
          </For>
        </Show>
      </div>
    </aside>
  );
}

function ChatRow(props: { chat: Chat; active: boolean; onClick: () => void }) {
  const displayName = () => props.chat.name || extractPhone(props.chat.chat_id) || props.chat.chat_id;
  const phone = () => !props.chat.is_group ? extractPhone(props.chat.chat_id) : '';
  const color = () => avatarColor(displayName());
  const initials = () => getInitials(displayName());
  const time = () => props.chat.last_message_at ? formatRelativeDate(new Date(props.chat.last_message_at)) : '';

  const dpUrl = () => profilePicUrl(props.chat.profile_pic);

  return (
    <button
      class="chat-row"
      classList={{ active: props.active }}
      onClick={props.onClick}
      aria-current={props.active ? 'true' : 'false'}
    >
      <Show when={dpUrl()} fallback={
        <div class="avatar" style={{ background: color() }}>{initials()}</div>
      }>
        <div class="avatar avatar-dp" style={{ background: color() }}>
          <span class="avatar-initials">{initials()}</span>
          <img class="avatar-img" src={dpUrl()!} alt="" width="44" height="44" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </Show>
      <div class="chat-row-body">
        <div class="chat-row-name">{displayName()}</div>
        <Show when={props.chat.name && (phone() !== props.chat.name || props.chat.lid)}>
          <div class="chat-row-phone">
            {phone()}{props.chat.lid && (phone() ? ` • ${props.chat.lid}` : props.chat.lid)}
          </div>
        </Show>
        <div class="chat-row-preview">
          <Show when={props.chat.is_group && props.chat.last_message_sender}>
            <span class="sender">{truncate(props.chat.last_message_sender || '', 15)}: </span>
          </Show>
          {truncate(props.chat.last_message_preview || '', 40)}
        </div>
      </div>
      <div class="chat-row-meta">
        <span class="chat-row-time">{time()}</span>
        <Show when={props.chat.deleted_count > 0}>
          <span class="badge-deleted">{props.chat.deleted_count}</span>
        </Show>
        <Show when={props.chat.is_group}>
          <span class="badge-group">Group</span>
        </Show>
      </div>
    </button>
  );
}
