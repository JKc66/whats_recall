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
  profilePicUrl,
  getDisplayName,
} from "./utils";
import type { Chat } from "./types";
import { SettingsIcon, LogoutIcon, SearchIcon, MoonIcon, SunIcon } from "./components/Icons";
import { theme, setTheme } from "./store";

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
        setSearchResults(results ?? []);
      }, 400);
    } else {
      setSearchResults(null);
    }
  });

  const filteredChats = createMemo(() => {
    const results = searchResults();
    if (results !== null) return results;
    return chats();
  });

  const isSearchActive = () => searchQuery().trim().length >= 2;

  async function openChat(chatId: string) {
    const q = searchQuery().trim();
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
      if (msgs) setMessages(msgs);
    } catch {
      /* handled */
    }
  }

  async function handleLogout() {
    await logout();
    setAuthenticated(false);
  }

  function toggleTheme() {
    setTheme(theme() === "dark" ? "light" : "dark");
  }

  return (
    <aside
      class="flex flex-col bg-surface border border-border min-h-0 h-[calc(100dvh-32px)] m-4 rounded-xl z-10 overflow-hidden transition-all duration-300 shadow-sm max-md:m-0 max-md:h-dvh max-md:border-none max-md:rounded-none"
      classList={{ "max-md:hidden": sidebarHidden() }}
    >
      <header class="flex items-center justify-between p-4 min-h-16 border-b border-border bg-surface-raised/30">
        <div class="flex items-center gap-3 text-display text-[18px]">
          <div class="relative flex items-center justify-center">
            <span
              class="w-1.5 h-1.5 rounded-full bg-text-disabled transition-all duration-300"
              classList={{
                "bg-accent shadow-[0_0_8px_var(--color-accent)]":
                  stats().connected,
              }}
            />
          </div>
          MONITOR
          <span class="text-label ml-1 opacity-50">V4.1</span>
        </div>
        <nav class="flex gap-1" aria-label="Sidebar actions">
          <button
            class="flex items-center justify-center w-8 h-8 rounded-full text-text-secondary hover:bg-border-visible hover:text-text-primary transition-all active:tick"
            onClick={toggleTheme}
            title={theme() === "dark" ? "Light Mode" : "Dark Mode"}
          >
            <Show when={theme() === "dark"} fallback={<MoonIcon size={16} />}>
              <SunIcon size={16} />
            </Show>
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 rounded-full text-text-secondary hover:bg-border-visible hover:text-text-primary transition-all active:tick"
            classList={{ "text-accent bg-accent-subtle": view() === "settings" }}
            onClick={() =>
              setView(view() === "settings" ? "chats" : "settings")
            }
            title="Settings"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            class="flex items-center justify-center w-8 h-8 rounded-full text-text-secondary hover:bg-accent hover:text-white transition-all active:tick"
            onClick={() => handleLogout()}
            title="Sign out"
          >
            <LogoutIcon size={16} />
          </button>
        </nav>
      </header>


      <div class="p-4">
        <div class="relative flex items-center">
          <SearchIcon
            size={14}
            class="absolute left-3 text-text-secondary pointer-events-none"
          />
          <input
            type="text"
            placeholder="SEARCH CHATS..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            spellcheck={false}
            class="w-full p-[8px_12px_8px_32px] bg-surface-raised border border-border technical text-text-primary text-[12px] font-mono outline-none transition-all focus:border-border-visible placeholder:text-text-disabled"
          />
        </div>
      </div>


      <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <Show
          when={filteredChats().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center p-12 text-center h-full gap-4">
              <Show when={isSearchActive()} fallback={<span class="text-label">NO CHATS</span>}>
                <span class="text-label">NO RESULTS FOR</span>
                <span class="text-metadata bg-surface-raised px-2 py-1 technical truncate max-w-40">"{searchQuery().trim()}"</span>
                <button
                  class="mt-2 text-label text-accent hover:underline"
                  onClick={() => setSearchQuery("")}
                >
                  CLEAR SEARCH
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
  const color = () => avatarColor(displayName());
  const initials = () => getInitials(displayName());
  const time = () =>
    props.chat.last_message_at
      ? formatRelativeDate(new Date(props.chat.last_message_at))
      : "";

  const dpUrl = () => profilePicUrl(props.chat.profile_pic);

  return (
    <button
      class="flex items-center p-3 m-[2px_12px] gap-3 cursor-pointer transition-all border-none technical bg-transparent text-inherit w-[calc(100%-24px)] text-left relative outline-none hover:bg-surface-raised active:tick group"
      classList={{ "bg-surface-raised": props.active }}
      onClick={() => props.onClick()}
      aria-current={props.active ? "true" : "false"}
    >
      {props.active && (
        <div class="absolute left-0 top-3 bottom-3 w-0.5 bg-accent" />
      )}
      <div
        class="w-10 h-10 min-w-10 technical flex items-center justify-center text-[12px] font-mono text-white uppercase overflow-hidden"
        style={{ background: color(), opacity: 0.8 }}
      >
        <Show when={dpUrl()} fallback={initials()}>
          <img
            class="w-full h-full object-cover"
            src={dpUrl()!}
            alt=""
            loading="lazy"
          />
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[14px] font-medium whitespace-nowrap overflow-hidden text-ellipsis text-text-primary">
          {displayName()}
        </div>
        <div class="text-metadata whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
          {truncate(props.chat.last_message_preview || "", 40)}
        </div>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <span class="text-metadata opacity-60 tabular-nums uppercase">
          {time()}
        </span>
        <Show when={props.chat.deleted_count > 0}>
          <span class="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 technical tabular-nums max-h-5 min-w-5 flex items-center justify-center">
            {props.chat.deleted_count}
          </span>
        </Show>
      </div>
    </button>

  );
}
