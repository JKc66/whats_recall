import { createEffect, onMount, Show } from 'solid-js';
import { verifyAuth, fetchStats, fetchChats, createWs } from './api';
import {
  authenticated, setAuthenticated,
  setChats, setStats, stats,
  currentChatId, setMessages, messages,
  addToast,
} from './store';
import type { Message, Chat } from './types';
import Login from './Login';
import Dashboard from './Dashboard';

export default function App() {
  let bootstrapped = false;

  onMount(async () => {
    const ok = await verifyAuth();
    setAuthenticated(ok);
  });

  function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    loadChats();
    loadStats();
    connectWs();
  }

  async function loadChats() {
    try {
      const c = await fetchChats();
      setChats(c);
    } catch { /* handled by api redirect */ }
  }

  async function loadStats() {
    try {
      const s = await fetchStats();
      setStats(s);
    } catch { /* handled */ }
  }

  function connectWs() {
    createWs((event, data) => {
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

        loadChats();
        loadStats();
      }
    });
  }

  createEffect(() => {
    if (authenticated() === true) {
      bootstrap();
    }
  });

  return (
    <Show when={authenticated() !== null} fallback={<div class="loading-screen"><div class="spinner" /></div>}>
      <Show when={authenticated()} fallback={<Login />}>
        <Dashboard />
      </Show>
    </Show>
  );
}
