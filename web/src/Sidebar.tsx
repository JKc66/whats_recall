import { createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js';
import { logout } from './api';
import {
  chats, currentChatId, setCurrentChatId, stats,
  view, setView, setAuthenticated, setMessages,
} from './store';
import { fetchMessages } from './api';
import { avatarColor, getInitials, formatRelativeDate, truncate } from './utils';
import type { Chat } from './types';

export default function Sidebar() {
  const [search, setSearch] = createSignal('');
  const [filter, setFilter] = createSignal<'all' | 'deleted'>('all');
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
    if (filter() === 'deleted') {
      list = list.filter((c) => c.deleted_count > 0);
    }
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
          <span class="status-dot" classList={{ on: stats().connected }} />
          Monitor
        </div>
        <div class="sidebar-actions">
          <button
            class="icon-btn"
            classList={{ active: view() === 'settings' }}
            onClick={() => setView(view() === 'settings' ? 'chats' : 'settings')}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
          <button class="icon-btn" onClick={handleLogout} title="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <div class="sidebar-search">
        <input
          type="text"
          placeholder="Search chats..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <div class="pill-group">
        <button class="pill" classList={{ active: filter() === 'all' }} onClick={() => setFilter('all')}>
          All Chats
        </button>
        <button class="pill" classList={{ active: filter() === 'deleted' }} onClick={() => setFilter('deleted')}>
          Deleted
        </button>
      </div>

      <div class="status-strip">
        <span>{stats().connected ? 'Connected' : stats().authenticated ? 'Initializing...' : 'Disconnected'}</span>
        <Show when={stats().deletedMessages > 0}>
          <span class="stats-deleted">{stats().deletedMessages} deleted</span>
        </Show>
      </div>

      <div class="chat-list">
        <Show when={filteredChats().length > 0} fallback={<div class="list-empty">No chats found</div>}>
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
  const color = () => avatarColor(props.chat.name || '?');
  const initials = () => getInitials(props.chat.name || '?');
  const time = () => props.chat.last_message_at ? formatRelativeDate(new Date(props.chat.last_message_at)) : '';

  return (
    <div class="chat-row" classList={{ active: props.active }} onClick={props.onClick}>
      <div class="avatar" style={{ background: color() }}>{initials()}</div>
      <div class="chat-row-body">
        <div class="chat-row-name">{props.chat.name || props.chat.chat_id}</div>
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
    </div>
  );
}
