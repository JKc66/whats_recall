import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import { logout, fetchMessages, markChatAsRead, fetchChats } from "./api";
import {
  chats,
  setChats,
  currentChatId,
  setCurrentChatId,
  stats,
  view,
  setView,
  setAuthenticated,
  setMessages,
  setJumpToQuery,
  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
} from "./store";
import {
  avatarColor,
  getInitials,
  formatRelativeDate,
  truncate,
  extractPhone,
  profilePicUrl,
  getDisplayName,
} from "./utils";
import type { Chat } from "./types";
import { SettingsIcon, LogoutIcon, SearchIcon } from "./components/Icons";

export default function Sidebar() {
  const [isMobile, setIsMobile] = createSignal(window.innerWidth <= 768);

  onMount(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });

  const sidebarHidden = () => {
    if (!isMobile()) return false;
    if (view() === "settings") return true;
    return !!currentChatId() && view() === "chats";
  };

  let searchTimeout: any;
  createEffect(() => {
    const q = searchQuery().trim();
    clearTimeout(searchTimeout);

    if (q.length >= 2) {
      searchTimeout = setTimeout(async () => {
        const results = await fetchChats(q, true);
        // Store locally — never mutate the global chats store
        setSearchResults(results ?? []);
      }, 400);
    } else {
      // Clear local results; global chats are untouched
      setSearchResults(null);
    }
  });

  // What to display: local search results OR full global list
  const filteredChats = createMemo(() => {
    const results = searchResults();
    if (results !== null) return results; // server-filtered
    return chats();
  });

  const isSearchActive = () => searchQuery().trim().length >= 2;

  async function openChat(chatId: string) {
    const q = searchQuery().trim();
    // Set jump target BEFORE loading messages so ChatView picks it up
    setJumpToQuery(q.length >= 2 ? q : null);

    setCurrentChatId(chatId);
    setView("chats");

    const chatList = chats();
    const chatToUpdate = chatList.find((c) => c.chat_id === chatId);
    if (chatToUpdate && chatToUpdate.deleted_count > 0) {
      setChats(
        chatList.map((c) =>
          c.chat_id === chatId ? { ...c, deleted_count: 0 } : c,
        ),
      );
      markChatAsRead(chatId).catch(() => {});
    }

    try {
      const msgs = await fetchMessages(chatId);
      setMessages(msgs);
    } catch {
      /* handled */
    }
  }

  async function handleLogout() {
    await logout();
    setAuthenticated(false);
  }

  return (
    <aside
      class="flex flex-col bg-zinc-900/55 backdrop-blur-glass border border-white/5 rounded-xl z-10 overflow-hidden h-[calc(100dvh-24px)] transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] max-md:h-dvh max-md:border-none max-md:rounded-none"
      classList={{ "max-md:hidden": sidebarHidden() }}
    >
      <header class="flex items-center justify-between p-4 min-h-16 border-b border-white/10 bg-white/2">
        <div class="flex items-center gap-3 text-[14px] font-black uppercase tracking-[-0.03em] text-zinc-100 font-sans">
          <div class="relative flex items-center justify-center">
            <span
              class="w-2 h-2 rounded-full bg-red-600 transition-all duration-300 shadow-[0_0_8px_rgba(230,25,25,0.4)]"
              classList={{
                "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse-glow":
                  stats().connected,
              }}
              title={
                stats().connected
                  ? "Connected"
                  : stats().authenticated
                    ? "Initializing…"
                    : "Disconnected"
              }
            />
          </div>
          Monitor
          <span class="text-[8px] opacity-20 ml-1 font-mono tracking-widest">v4.0.1</span>
        </div>
        <nav class="flex gap-0.5" aria-label="Sidebar actions">
          <button
            class="flex items-center justify-center w-9 h-9 bg-transparent border-none rounded-lg text-text-3 cursor-pointer transition-all duration-200 text-[18px] shrink-0 hover:bg-white/5 hover:text-zinc-400 active:scale-[0.96] active:bg-white/7"
            classList={{ "text-accent bg-accent-muted": view() === "settings" }}
            onClick={() =>
              setView(view() === "settings" ? "chats" : "settings")
            }
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon size={18} />
          </button>
          <button
            class="flex items-center justify-center w-9 h-9 bg-transparent border-none rounded-lg text-text-3 cursor-pointer transition-all duration-200 text-[18px] shrink-0 hover:bg-white/5 hover:text-zinc-400 active:scale-[0.96] active:bg-white/7"
            onClick={() => handleLogout()}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogoutIcon size={18} />
          </button>
        </nav>
      </header>

      <div class="p-[8px_14px]">
        <div class="relative flex items-center">
          <SearchIcon
            size={16}
            class="absolute left-3 text-text-3 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search chats…"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            spellcheck={false}
            aria-label="Search chats"
            class="w-full p-[9px_14px_9px_36px] bg-bg-surface border border-white/6 rounded-lg text-zinc-100 font-inherit text-[13px] outline-none transition-all duration-300 focus-visible:border-accent focus-visible:shadow-[0_0_0_2px_rgba(16,185,129,0.08)] placeholder:text-text-3"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <Show
          when={filteredChats().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center p-[48px_24px] text-text-3 text-[13px] text-center h-full gap-1">
              <Show when={isSearchActive()} fallback={<span>No chats found</span>}>
                <span class="text-[20px] mb-1">🔍</span>
                <span>No messages found for</span>
                <span class="text-zinc-300 font-mono text-[12px] bg-white/5 px-2 py-0.5 rounded mt-0.5 max-w-48 truncate">"{searchQuery().trim()}"</span>
                <button
                  class="mt-2 text-[11px] font-bold text-accent uppercase tracking-wider hover:bg-accent/10 py-1 px-2.5 rounded transition-colors"
                  onClick={() => setSearchQuery("")}
                >
                  Clear search
                </button>
              </Show>
            </div>
          }
        >
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
  const displayName = () => getDisplayName(props.chat);
  const phone = () =>
    !props.chat.is_group ? extractPhone(props.chat.chat_id) : "";
  const color = () => avatarColor(displayName());
  const initials = () => getInitials(displayName());
  const time = () =>
    props.chat.last_message_at
      ? formatRelativeDate(new Date(props.chat.last_message_at))
      : "";

  const dpUrl = () => profilePicUrl(props.chat.profile_pic);

  return (
    <button
      class="flex items-center p-[10px_12px] m-[2px_8px] gap-3 cursor-pointer transition-all duration-200 border-none rounded-lg bg-transparent text-inherit font-inherit w-[calc(100%-16px)] text-left relative outline-none animate-list-fade-in focus-visible:bg-white/5 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] focus-visible:z-1 hover:bg-white/5 active:bg-white/10 active:scale-[0.98] group"
      classList={{ "bg-accent-muted": props.active }}
      onClick={() => props.onClick()}
      aria-current={props.active ? "true" : "false"}
    >
      {props.active && (
        <div class="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-full bg-accent" />
      )}
      <Show
        when={dpUrl()}
        fallback={
          <div
            class="w-11 h-11 min-w-11 rounded-xl flex items-center justify-center text-sm font-semibold text-white uppercase"
            style={{ background: color() }}
          >
            {initials()}
          </div>
        }
      >
        <div
          class="relative w-11 h-11 min-w-11 rounded-xl flex items-center justify-center text-sm font-semibold text-white uppercase overflow-hidden"
          style={{ background: color() }}
        >
          <span class="relative z-1">{initials()}</span>
          <img
            class="absolute inset-0 w-full h-full object-cover rounded-inherit z-2"
            src={dpUrl()!}
            alt=""
            width="44"
            height="44"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      </Show>
      <div class="flex-1 min-w-0 overflow-hidden">
        <div class="text-[13.5px] font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-tight text-zinc-100">
          {displayName()}
        </div>
        <Show
          when={
            props.chat.name && (phone() !== props.chat.name || props.chat.lid)
          }
        >
          <div class="text-[10.5px] text-text-3 font-mono mt-px">
            {phone()}
            {props.chat.lid &&
              (phone() ? ` • ${props.chat.lid}` : props.chat.lid)}
          </div>
        </Show>
        <div class="text-[12px] text-text-3 whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
          <Show when={props.chat.is_group && props.chat.last_message_sender}>
            <span class="text-zinc-400 font-medium">
              {truncate(props.chat.last_message_sender || "", 15)}:{" "}
            </span>
          </Show>
          {truncate(props.chat.last_message_preview || "", 40)}
        </div>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <span class="text-[10px] text-text-3 font-medium font-mono tabular-nums">
          {time()}
        </span>
        <Show when={props.chat.deleted_count > 0}>
          <span class="bg-red-500 text-white text-[10px] font-bold p-[1px_6px] rounded-full min-w-4.5 text-center tabular-nums shadow-[0_2px_8px_rgba(239,68,68,0.3)]">
            {props.chat.deleted_count}
          </span>
        </Show>
        <Show when={props.chat.is_group}>
          <span class="text-[10px] text-zinc-500 font-medium p-[1px_6px] border border-white/6 rounded-full">
            Group
          </span>
        </Show>
      </div>
    </button>
  );
}
