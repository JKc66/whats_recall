import { createEffect, onMount, onCleanup, Show } from "solid-js";
import { Toaster } from "solid-toast";
import {
  verifyAuth,
  fetchStats,
  fetchChats,
  fetchMessages,
  createWs,
} from "./api";
import {
  authenticated,
  setAuthenticated,
  setChats,
  setStats,
  currentChatId,
  setMessages,
} from "./store";
import { notify } from "./notify";
import type { Message, Chat } from "./types";
import Login from "./Login";
import Dashboard from "./Dashboard";

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

    const [c, s] = await Promise.all([fetchChats(undefined, true), fetchStats(true)]);
    if (c) setChats(c);
    if (s) setStats(s);

    const chatId = currentChatId();
    if (chatId) {
      const msgs = await fetchMessages(chatId, 200, true);
      if (msgs) setMessages(msgs);
    }
  }

  function startFocusRefresh() {
    const onVisible = () => {
      if (document.visibilityState === "visible" && authenticated() === true) {
        silentRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVisible);
    });
  }

  function connectWs() {
    createWs((event, data) => {
      if (event === "status") {
        const d = data as { connected: boolean; authenticated?: boolean };
        setStats((s) => ({
          ...s,
          connected: d.connected,
          authenticated: d.authenticated ?? d.connected,
        }));
      }

      if (event === "new_message") {
        const msg = data as any;
        const chatId = msg.chat_id;
        const chatName = msg.chat_name;
        const isGroup = msg.is_group === 1;
        const senderName = msg.sender_name;
        const profilePic = msg.profile_pic || null;

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === chatId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              name: chatName || updated[idx].name,
              last_message_preview: (msg.body as string) || `MEDIA_${msg.type?.toUpperCase() || 'CONTENT'}`,
              last_message_sender: senderName,
              last_message_at: new Date().toISOString(),
              total_messages: updated[idx].total_messages + 1,
              profile_pic: profilePic || updated[idx].profile_pic,
            };
            return updated;
          }
          return [
            {
              chat_id: chatId,
              name: chatName,
              is_group: isGroup ? 1 : 0,
              last_message_at: new Date().toISOString(),
              last_message_preview: (msg.body as string) || `MEDIA_${msg.type?.toUpperCase() || 'CONTENT'}`,
              last_message_sender: senderName,
              deleted_count: 0,
              total_deleted_count: 0,
              total_messages: 1,
              profile_pic: profilePic,
            } as Chat,
            ...prev,
          ];
        });

        if (currentChatId() === chatId) {
          const normalized: Message = {
            ...msg,
            is_from_me: msg.is_from_me ? 1 : 0,
            is_deleted: 0,
            deleted_at: null,
            is_view_once: msg.is_view_once ? 1 : 0,
            reactions: [],
            edits: [],
          };
          setMessages((m) => [...m, normalized]);
        }
      }

      if (event === "message_deleted") {
        const msg = data as Message & { chatName: string; isGroup: number };

        notify.deleted(
          msg.sender_name || "UNKNOWN",
          msg.body ? msg.body.slice(0, 80) : "MEDIA_CONTENT",
        );

        if (currentChatId() === msg.chat_id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === msg.message_id
                ? { ...m, is_deleted: 1, deleted_at: msg.deleted_at }
                : m,
            ),
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
          return [
            {
              chat_id: msg.chat_id,
              name: msg.chatName || msg.sender_name || msg.chat_id,
              is_group: msg.isGroup || 0,
              last_message_at: new Date().toISOString(),
              last_message_preview: msg.body || "DELETED_MESSAGE",
              last_message_sender: msg.sender_name || null,
              deleted_count: 1,
              total_deleted_count: 1,
              total_messages: 1,
              profile_pic: null,
            } as Chat,
            ...prev,
          ];
        });

        setStats((s) => ({
          ...s,
          deletedMessages: s.deletedMessages + 1,
        }));
      }

      if (event === "message_reaction") {
        const r = data as {
          chat_id: string;
          message_id: string;
          sender_id: string;
          sender_name: string;
          emoji: string;
        };
        if (currentChatId() === r.chat_id) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.message_id !== r.message_id) return m;
              const existing = (m.reactions || []).filter(
                (rx) => rx.sender_id !== r.sender_id,
              );
              if (r.emoji) {
                existing.push({
                  sender_id: r.sender_id,
                  sender_name: r.sender_name,
                  emoji: r.emoji,
                });
              }
              return { ...m, reactions: existing };
            }),
          );
        }
      }

      if (event === "message_edited") {
        const edit = data as {
          message_id: string;
          chat_id: string;
          body: string;
          old_body: string;
          updated_at: string;
        };
        if (currentChatId() === edit.chat_id) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.message_id !== edit.message_id) return m;
              const newEdits = [...(m.edits || [])];
              if (edit.old_body) {
                newEdits.push({
                  old_body: edit.old_body,
                  new_body: edit.body,
                  edited_at: edit.updated_at,
                });
              }
              return { ...m, body: edit.body, edits: newEdits };
            }),
          );
        }

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === edit.chat_id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              last_message_preview: edit.body,
            };
            return updated;
          }
          return prev;
        });
      }

      if (event === "profile_pic_updated") {
        const update = data as { chat_id: string; profile_pic: string };
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.chat_id === update.chat_id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], profile_pic: update.profile_pic };
            return updated;
          }
          return prev;
        });
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
      <Show
        when={authenticated() !== null}
        fallback={
          <div class="flex flex-col items-center justify-center min-h-dvh gap-6 animate-entrance bg-bg dot-grid">
            <div class="flex gap-2">
              <div class="w-2 h-2 rounded-lg bg-text-primary animate-pulse" />
              <div class="w-2 h-2 rounded-lg bg-text-primary animate-pulse [animation-delay:0.2s]" />
              <div class="w-2 h-2 rounded-lg bg-text-primary animate-pulse [animation-delay:0.4s]" />
            </div>
            <span class="text-label opacity-40">Connecting to system...</span>
          </div>
        }
      >
        <Show when={authenticated()} fallback={<Login />}>
          <Dashboard />
        </Show>
      </Show>
      <Toaster
        position={window.innerWidth <= 768 ? "bottom-center" : "top-right"}
        gutter={8}
        containerStyle={{ "z-index": "2100", "font-family": "var(--font-mono)" }}
        toastOptions={{
          style: {
            background: "#121212",
            color: "#EAEAEA",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            "border-radius": "8px",
            "font-size": "11px",
            "text-transform": "uppercase",
            "letter-spacing": "0.1em",
            "box-shadow": "none",
          },
          duration: 4000,
        }}
      />
    </>
  );
}
