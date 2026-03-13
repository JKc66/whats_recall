import { createEffect, onMount, onCleanup, Show } from 'solid-js';
import { verifyAuth, fetchStats, fetchChats, fetchMessages, createWs } from './api';
import {
  authenticated, setAuthenticated,
  setChats, setStats, stats,
  currentChatId, setMessages,
  addToast,
} from './store';
import type { Message, Chat } from './types';
import Login from './Login';
import Dashboard from './Dashboard';

export default function App() {
  let bootstrapped = false;
  let wsRef: { close: () => void } | null = null;

  onMount(async () => {
    const ok = await verifyAuth();
    setAuthenticated(ok);
  });

  function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    refreshData();
    connectWs();
    startFocusRefresh();
  }

  async function refreshData() {
    try {
      const [c, s] = await Promise.all([fetchChats(), fetchStats()]);
      setChats(c);
      setStats(s);
    } catch { /* handled by api redirect */ }

    const chatId = currentChatId();
    if (chatId) {
      try {
        const msgs = await fetchMessages(chatId);
        setMessages(msgs);
      } catch { /* handled */ }
    }
  }

  function startFocusRefresh() {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && authenticated() === true) {
        refreshData();
      }
    };
    const onFocus = () => {
      if (authenticated() === true) refreshData();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    });
  }

  function connectWs() {
    wsRef = createWs((event, data) => {
      if (event === 'status') {
        const d = data as { connected: boolean; authenticated?: boolean };
        setStats((s) => ({
          ...s,
          connected: d.connected,
          authenticated: d.authenticated ?? d.connected,
        }));
      }

      if (event === 'new_message') {
        const msg = data as Message & { chatId: string; chatName: string; isGroup: boolean; senderName: string };

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === msg.chatId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              last_message_preview: msg.body || `[${msg.type}]`,
              last_message_sender: msg.senderName,
              last_message_at: new Date().toISOString(),
              total_messages: updated[idx].total_messages + 1,
            };
            return updated;
          }
          return [{
            chat_id: msg.chatId,
            name: msg.chatName,
            is_group: msg.isGroup ? 1 : 0,
            last_message_at: new Date().toISOString(),
            last_message_preview: msg.body || `[${msg.type}]`,
            last_message_sender: msg.senderName,
            deleted_count: 0,
            total_messages: 1,
          } as Chat, ...prev];
        });

        if (currentChatId() === msg.chatId) {
          setMessages((m) => [...m, msg as unknown as Message]);
        }
      }

      if (event === 'message_deleted') {
        const msg = data as Message & { chatName: string };

        addToast(
          'Message Deleted',
          `${msg.sender_name || 'Unknown'}: ${msg.body ? msg.body.slice(0, 60) : '[Media]'}`
        );

        if (currentChatId() === msg.chat_id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === msg.message_id
                ? { ...m, is_deleted: 1, deleted_at: msg.deleted_at }
                : m
            )
          );
        }

        refreshData();
      }
    });
  }

  createEffect(() => {
    if (authenticated() === true) {
      bootstrap();
    }
  });

  return (
    <>
      <div class="bg-pattern" />
      <Show when={authenticated() !== null} fallback={<div class="loading-screen"><div class="spinner" /></div>}>
        <Show when={authenticated()} fallback={<Login />}>
          <Dashboard />
        </Show>
      </Show>
    </>
  );
}
