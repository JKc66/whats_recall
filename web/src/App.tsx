import { createEffect, onMount, onCleanup, Show } from 'solid-js';
import { Toaster } from 'solid-toast';
import { verifyAuth, fetchStatsSilent, fetchChatsSilent, fetchMessagesSilent, createWs } from './api';
import {
  authenticated, setAuthenticated,
  setChats, setStats, stats,
  currentChatId, setMessages,
} from './store';
import { notify } from './notify';
import type { Message, Chat } from './types';
import Login from './Login';
import Dashboard from './Dashboard';

export default function App() {
  let bootstrapped = false;
  let lastRefresh = 0;
  const REFRESH_COOLDOWN = 15_000;

  onMount(async () => {
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
        const msg = data as Record<string, unknown>;

        const chatId = msg.chatId as string;
        const chatName = msg.chatName as string;
        const isGroup = msg.isGroup as boolean;
        const senderName = msg.senderName as string;
        const profilePic = (msg.profilePic as string) || null;

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === chatId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              name: chatName || updated[idx].name,
              last_message_preview: (msg.body as string) || `[${msg.type}]`,
              last_message_sender: senderName,
              last_message_at: new Date().toISOString(),
              total_messages: updated[idx].total_messages + 1,
              profile_pic: profilePic || updated[idx].profile_pic,
            };
            return updated;
          }
          return [{
            chat_id: chatId,
            name: chatName,
            is_group: isGroup ? 1 : 0,
            last_message_at: new Date().toISOString(),
            last_message_preview: (msg.body as string) || `[${msg.type}]`,
            last_message_sender: senderName,
            deleted_count: 0,
            total_deleted_count: 0,
            total_messages: 1,
            profile_pic: profilePic,
          } as Chat, ...prev];
        });

        if (currentChatId() === chatId) {
          const normalized: Message = {
            message_id: msg.messageId as string,
            chat_id: chatId,
            sender_id: (msg.senderId as string) || null,
            sender_name: senderName || null,
            body: (msg.body as string) || null,
            type: (msg.type as string) || 'chat',
            has_media: (msg.hasMedia as boolean) ? 1 : 0,
            media_type: (msg.mediaType as string) || null,
            media_filename: (msg.mediaFilename as string) || null,
            media_path: (msg.mediaPath as string) || null,
            timestamp: msg.timestamp as number,
            is_from_me: (msg.isFromMe as boolean) ? 1 : 0,
            is_deleted: 0,
            deleted_at: null,
            is_view_once: (msg.isViewOnce as boolean) ? 1 : 0,
            original_id: (msg.originalId as string) || null,
            quoted_stanza_id: (msg.quotedStanzaId as string) || null,
            quoted_sender: (msg.quotedSender as string) || null,
            quoted_preview: (msg.quotedPreview as string) || null,
            reactions: [],
          };
          setMessages((m) => [...m, normalized]);
        }
      }

      if (event === 'message_deleted') {
        const msg = data as Message & { chatName: string; isGroup: number };

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
              total_deleted_count: (updated[idx].total_deleted_count || 0) + 1,
            };
            return updated;
          }
          return [{
            chat_id: msg.chat_id,
            name: msg.chatName || msg.sender_name || msg.chat_id,
            is_group: msg.isGroup || 0,
            last_message_at: new Date().toISOString(),
            last_message_preview: msg.body || '[Deleted message]',
            last_message_sender: msg.sender_name || null,
            deleted_count: 1,
            total_deleted_count: 1,
            total_messages: 1,
            profile_pic: null,
          } as Chat, ...prev];
        });

        setStats((s) => ({
          ...s,
          deletedMessages: s.deletedMessages + 1,
        }));
      }

      if (event === 'message_reaction') {
        const r = data as { chatId: string; targetMessageId: string; senderId: string; senderName: string; emoji: string };
        if (currentChatId() === r.chatId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.message_id !== r.targetMessageId) return m;
              const existing = (m.reactions || []).filter(rx => rx.sender_id !== r.senderId);
              if (r.emoji) {
                existing.push({ sender_id: r.senderId, sender_name: r.senderName, emoji: r.emoji });
              }
              return { ...m, reactions: existing };
            })
          );
        }
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
      <div class="bg-pattern" aria-hidden="true" />
      <Show when={authenticated() !== null} fallback={<div class="loading-screen"><div class="spinner" /></div>}>
        <Show when={authenticated()} fallback={<Login />}>
          <Dashboard />
        </Show>
      </Show>
      <Toaster
        position="top-right"
        gutter={8}
        containerStyle={{ 'z-index': '2100' }}
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            border: '1px solid var(--border-strong)',
            'border-radius': 'var(--radius)',
            'font-family': 'inherit',
            'font-size': '13px',
            'box-shadow': 'var(--shadow-lg)',
          },
          duration: 4000,
        }}
      />
    </>
  );
}
