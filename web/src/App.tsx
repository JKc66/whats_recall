import { createEffect, onMount, onCleanup, Show } from 'solid-js';
import { verifyAuth, fetchStatsSilent, fetchChatsSilent, fetchMessagesSilent, createWs } from './api';
import {
  authenticated, setAuthenticated,
  setChats, setStats, stats,
  currentChatId, setMessages,
} from './store';
import { notify } from './notify';
import { mountSileo } from './sileo-bridge';
import type { Message, Chat } from './types';
import Login from './Login';
import Dashboard from './Dashboard';

export default function App() {
  let bootstrapped = false;
  let lastRefresh = 0;
  const REFRESH_COOLDOWN = 15_000;

  onMount(async () => {
    mountSileo();
    const ok = await verifyAuth();
    setAuthenticated(ok);
  });

  function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    silentRefresh();
    connectWs();
    startFocusRefresh();
  }

  async function silentRefresh() {
    const now = Date.now();
    if (now - lastRefresh < REFRESH_COOLDOWN) return;
    lastRefresh = now;

    const [c, s] = await Promise.all([fetchChatsSilent(), fetchStatsSilent()]);
    if (c) setChats(c);
    if (s) setStats(s);

    const chatId = currentChatId();
    if (chatId) {
      const msgs = await fetchMessagesSilent(chatId);
      if (msgs) setMessages(msgs);
    }
  }

  function startFocusRefresh() {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && authenticated() === true) {
        silentRefresh();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisible);
    });
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

        notify.deleted(
          msg.sender_name || 'Unknown',
          msg.body ? msg.body.slice(0, 80) : '[Media]'
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

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === msg.chat_id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              deleted_count: updated[idx].deleted_count + 1,
            };
            return updated;
          }
          return prev;
        });

        setStats((s) => ({
          ...s,
          deletedMessages: s.deletedMessages + 1,
        }));
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
