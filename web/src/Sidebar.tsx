import { createSignal, createMemo, For, Show } from 'solid-js';
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
    <aside class="sidebar" classList={{ hidden: !!currentChatId() && view() === 'chats' && window.innerWidth <= 768 }}>
      <header class="sidebar-header">
        <h1>
          <span class="dot" classList={{ connected: stats().connected }} />
          Monitor
        </h1>
        <div class="header-actions">
          <button
            onClick={() => setView(view() === 'settings' ? 'chats' : 'settings')}
            title="Settings"
            classList={{ active: view() === 'settings' }}
          >
            ⚙
          </button>
          <button onClick={handleLogout} title="Logout">⏻</button>
        </div>
      </header>

      <div class="search-container">
        <input
          type="text"
          placeholder="Search chats..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <div class="filter-tabs">
        <button classList={{ active: filter() === 'all' }} onClick={() => setFilter('all')}>
          All Chats
        </button>
        <button classList={{ active: filter() === 'deleted' }} onClick={() => setFilter('deleted')}>
          With Deleted
        </button>
      </div>

      <div class="status-bar">
        <span>{stats().connected ? 'Connected' : 'Disconnected'}</span>
        <Show when={stats().deletedMessages > 0}>
          <span class="stats-deleted">{stats().deletedMessages} deleted</span>
        </Show>
      </div>

      <div class="chat-list">
        <Show when={filteredChats().length > 0} fallback={<div class="list-empty">No chats found</div>}>
          <For each={filteredChats()}>
            {(chat) => <ChatItem chat={chat} active={currentChatId() === chat.chat_id} onClick={() => openChat(chat.chat_id)} />}
          </For>
        </Show>
      </div>
    </aside>
  );
}

function ChatItem(props: { chat: Chat; active: boolean; onClick: () => void }) {
  const color = () => avatarColor(props.chat.name || '?');
  const initials = () => getInitials(props.chat.name || '?');
  const time = () => props.chat.last_message_at ? formatRelativeDate(new Date(props.chat.last_message_at)) : '';

  return (
    <div class="chat-item" classList={{ active: props.active }} onClick={props.onClick}>
      <div class="chat-avatar" style={{ background: color() }}>{initials()}</div>
      <div class="chat-info">
        <div class="name">{props.chat.name || props.chat.chat_id}</div>
        <div class="preview">
          <Show when={props.chat.is_group && props.chat.last_message_sender}>
            <span class="sender">{truncate(props.chat.last_message_sender || '', 15)}: </span>
          </Show>
          {truncate(props.chat.last_message_preview || '', 40)}
        </div>
      </div>
      <div class="chat-meta">
        <span class="time">{time()}</span>
        <Show when={props.chat.deleted_count > 0}>
          <span class="deleted-badge">{props.chat.deleted_count}</span>
        </Show>
        <Show when={props.chat.is_group}>
          <span class="group-icon">👥</span>
        </Show>
      </div>
    </div>
  );
}
