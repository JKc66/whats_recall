import {
  createSignal,
  createMemo,
  createEffect,
  Show,
  onCleanup,
  onMount,
} from "solid-js";
import {
  currentChatId,
  setCurrentChatId,
  messages,
  chats,
  showOnlyDeleted,
  setShowOnlyDeleted,
  setView,
  jumpToQuery,
  setJumpToQuery,
  searchQuery,
} from "./store";
import { MessageSquareIcon, SettingsIcon, XIcon, ArrowDownIcon, SearchIcon, ArrowUpIcon } from "./components/Icons";
import ChatHeader from "./components/chat/ChatHeader";
import MessageList from "./components/chat/MessageList";
import MediaGallery from "./components/chat/MediaGallery";

export default function ChatView() {
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null);
  const [viewMode, setViewMode] = createSignal<"messages" | "media">("messages");
  const [showScrollBottom, setShowScrollBottom] = createSignal(false);
  const [searchMatchIds, setSearchMatchIds] = createSignal<string[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = createSignal(0);
  let containerRef: HTMLDivElement | undefined;

  const chat = () => chats().find((c) => c.chat_id === currentChatId());

  let lastScrolledState: string | null = null;

  // Auto-scroll on chat change or message updates
  createEffect(() => {
    const msgs = displayMessages();
    const cid = currentChatId();
    const mode = viewMode();
    const stateKey = `${cid}:${mode}`;

    if (cid && mode === "messages" && msgs.length > 0) {
      if (msgs[0].chat_id === cid && lastScrolledState !== stateKey) {
        lastScrolledState = stateKey;
        const q = jumpToQuery();
        if (q) {
          const lower = q.toLowerCase();
          const matches = msgs
            .filter((m) => (m.body || "").toLowerCase().includes(lower))
            .map((m) => m.message_id);
          setSearchMatchIds(matches);
          setSearchMatchIndex(0);
          setJumpToQuery(null);
          setTimeout(() => {
            if (matches.length > 0) {
              scrollToMessage(matches[0]);
            }
          }, 80);
        } else {
          setSearchMatchIds([]);
        }
      }
    }

    if (!cid) {
      lastScrolledState = null;
      setSearchMatchIds([]);
    }
  });

  function navigateMatch(dir: 1 | -1) {
    const ids = searchMatchIds();
    if (ids.length === 0) return;
    const next = (searchMatchIndex() + dir + ids.length) % ids.length;
    setSearchMatchIndex(next);
    scrollToMessage(ids[next]);
  }

  // Track scroll position to show/hide "Scroll to Bottom" button
  function handleScroll() {
    if (!containerRef) return;
    const { scrollTop } = containerRef;
    const isAtBottom = Math.abs(scrollTop) < 150;
    setShowScrollBottom(!isAtBottom);
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    if (containerRef) {
      containerRef.scrollTo({
        top: 0,
        behavior,
      });
    }
  }

  const displayMessages = createMemo(() => {
    const msgs = messages();
    if (showOnlyDeleted()) return msgs.filter((m) => m.is_deleted);
    return msgs;
  });

  const mediaMessages = createMemo(() =>
    messages().filter(
      (m) => m.has_media && m.media_path && m.type !== "sticker",
    ),
  );

  function closeLightbox() {
    setLightboxSrc(null);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (lightboxSrc()) closeLightbox();
      else back();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  function back() {
    setCurrentChatId(null);
  }

  function scrollToMessage(messageId: string) {
    if (!containerRef) return;
    const el = containerRef.querySelector(
      `[data-msg-id="${messageId}"]`,
    ) as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1500);
    }
  }

  function findMessageByStanzaId(stanzaId: string) {
    return messages().find(
      (m) => m.message_id === stanzaId || m.original_id === stanzaId,
    );
  }

  return (
    <>
      <Show when={!currentChatId()}>
        <div class="flex-1 flex flex-col items-center justify-center gap-6 p-10 bg-black dot-grid">
          <div
            class="flex items-center justify-center w-24 h-24 technical bg-surface border border-border text-text-secondary"
            aria-hidden="true"
          >
            <MessageSquareIcon size={48} stroke-width={1} />
          </div>
          <div class="text-center">
            <h2 class="text-display text-[32px] tracking-tight">
              CONVERSATIONS
            </h2>
            <p class="text-[13px] max-w-85 mx-auto mt-4 text-text-secondary leading-relaxed font-mono uppercase tracking-wider">
              SELECT A CONVERSATION TO VIEW MESSAGE HISTORY. DELETED CONTENT IS AUTOMATICALLY PRESERVED AND HIGHLIGHTED.
            </p>
          </div>
          <button
            class="flex items-center gap-2 mt-4 px-6 py-3 technical bg-surface hover:bg-surface-raised border border-border text-text-primary text-label transition-all active:tick"
            onClick={() => setView("settings")}
          >
            <SettingsIcon size={14} />
            SETTINGS
          </button>
        </div>
      </Show>


      <Show when={currentChatId()}>
        <ChatHeader
          chat={chat()}
          chatId={currentChatId()!}
          showOnlyDeleted={showOnlyDeleted()}
          onShowOnlyDeletedChange={setShowOnlyDeleted}
          viewMode={viewMode()}
          onViewModeChange={setViewMode}
          onBack={back}
        />

        <Show when={searchMatchIds().length > 0}>
          <div class="flex items-center justify-between px-4 py-2 bg-surface-raised/90 border-b border-border text-[12px] text-text-secondary backdrop-blur-md gap-3 shrink-0 shadow-sm animate-in slide-in-from-top-1 duration-200">
            <div class="flex items-center gap-2">
              <SearchIcon size={13} class="text-accent" />
              <span>
                <span class="text-text-primary font-semibold tabular-nums">{searchMatchIndex() + 1}</span>
                {" of "}
                <span class="text-text-primary font-semibold tabular-nums">{searchMatchIds().length}</span>
                {" matches"}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="w-7 h-7 rounded-md bg-surface-raised hover:bg-border border border-border flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                onClick={() => navigateMatch(-1)}
                aria-label="Previous match"
              >
                <ArrowUpIcon size={13} stroke-width={2.5} />
              </button>
              <button
                class="w-7 h-7 rounded-md bg-surface-raised hover:bg-border border border-border flex items-center justify-center transition-all active:scale-90"
                onClick={() => navigateMatch(1)}
                aria-label="Next match"
              >
                <ArrowDownIcon size={13} stroke-width={2.5} />
              </button>
              <button
                class="w-7 h-7 rounded-md bg-surface-raised hover:bg-red-500/10 hover:text-red-400 border border-border flex items-center justify-center transition-all active:scale-90 ml-1"
                onClick={() => { setSearchMatchIds([]); setSearchMatchIndex(0); }}
                aria-label="Clear search matches"
              >
                <XIcon size={13} />
              </button>
            </div>
          </div>
        </Show>

        <div class="flex-1 flex flex-col overflow-hidden relative">
          <div
            class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 bg-bg-surface/30 flex flex-col-reverse"
            ref={(el) => (containerRef = el)}
            onScroll={handleScroll}
          >
            <Show when={viewMode() === "messages"}>
              <Show
                when={displayMessages().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center p-12 text-text-disabled text-sm text-center gap-1 italic opacity-60 min-h-full">
                    No {showOnlyDeleted() ? "deleted " : ""}messages in this chat
                  </div>
                }
              >
                <MessageList
                  messages={displayMessages()}
                  isGroup={!!chat()?.is_group}
                  onImageClick={setLightboxSrc}
                  onQuoteClick={scrollToMessage}
                  findMessage={findMessageByStanzaId}
                  highlightQuery={searchQuery()}
                />
              </Show>
            </Show>

            <Show when={viewMode() === "media"}>
              <MediaGallery
                messages={mediaMessages()}
                onImageClick={setLightboxSrc}
                onJumpToMessage={(id: string) => {
                  setViewMode("messages");
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => scrollToMessage(id));
                  });
                }}
              />
            </Show>
          </div>

          {/* Scroll to Bottom Button - Fixed Position Relative to Parent */}
          <Show when={viewMode() === "messages" && showScrollBottom() && displayMessages().length > 0}>
            <button
              class="absolute bottom-6 right-6 w-11 h-11 bg-surface text-text-secondary border border-border rounded-full flex items-center justify-center shadow-xl hover:scale-105 hover:bg-surface-raised active:scale-95 cursor-pointer backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 z-20"
              onClick={() => scrollToBottom()}
              aria-label="Scroll to bottom"
            >
              <ArrowDownIcon size={20} stroke-width={2.5} />
            </button>
          </Show>
        </div>
      </Show>

      <Show when={lightboxSrc()}>
        <div
          class="fixed inset-0 z-3000 bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={closeLightbox}
          role="dialog"
          aria-label="Image preview"
        >
          <button
            class="absolute top-6 right-6 w-12 h-12 bg-surface-raised hover:bg-border rounded-full flex items-center justify-center text-text-primary transition-all active:scale-90 border border-border shadow-2xl"
            onClick={closeLightbox}
            aria-label="Close preview"
          >
            <XIcon size={24} />
          </button>
          <img
            src={lightboxSrc()!}
            alt="Full size preview"
            class="max-w-full max-h-full object-contain rounded-lg shadow-[0_0_100px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </Show>
    </>
  );
}
