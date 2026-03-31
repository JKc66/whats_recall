import {
  createSignal,
  createMemo,
  createEffect,
  Show,
  onCleanup,
} from "solid-js";
import {
  currentChatId,
  setCurrentChatId,
  messages,
  chats,
  showOnlyDeleted,
  setShowOnlyDeleted,
  setView,
} from "./store";
import { MessageSquareIcon, SettingsIcon, XIcon } from "./components/Icons";
import ChatHeader from "./components/chat/ChatHeader";
import MessageList from "./components/chat/MessageList";
import MediaGallery from "./components/chat/MediaGallery";

export default function ChatView() {
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null);
  const [viewMode, setViewMode] = createSignal<"messages" | "media">(
    "messages",
  );
  let containerRef: HTMLDivElement | undefined;

  const chat = () => chats().find((c) => c.chat_id === currentChatId());

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

  createEffect(() => {
    if (currentChatId()) {
      setViewMode("messages");
      requestAnimationFrame(() => scrollToBottom());
    }
  });

  createEffect(() => {
    messages();
    if (viewMode() === "messages") {
      requestAnimationFrame(() => scrollToBottom());
    }
  });

  function scrollToBottom() {
    if (containerRef) containerRef.scrollTop = containerRef.scrollHeight;
  }

  function closeLightbox() {
    setLightboxSrc(null);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (lightboxSrc()) closeLightbox();
      else back();
    }
  }

  createEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
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
        <div class="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500 p-10 bg-bg-surface/20">
          <div
            class="flex items-center justify-center w-20 h-20 rounded-3xl bg-zinc-900 border border-white/5 text-zinc-700 shadow-xl"
            aria-hidden="true"
          >
            <MessageSquareIcon size={40} stroke-width={1.5} />
          </div>
          <div class="text-center">
            <h2 class="text-xl font-bold text-zinc-100 tracking-tight font-outfit">
              Message Monitor
            </h2>
            <p class="text-sm max-w-[320px] mx-auto mt-2 text-zinc-500 leading-relaxed">
              Select a chat to view messages. Deleted messages are highlighted
              and preserved seamlessly.
            </p>
          </div>
          <button
            class="flex items-center gap-2 mt-4 px-5 py-2.5 bg-zinc-800 hover:bg-white/10 text-white rounded-xl border border-white/5 font-medium transition-all shadow-lg active:scale-95"
            onClick={() => setView("settings")}
          >
            <SettingsIcon size={16} stroke-width={2} />
            Configure Chats
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

        <div
          class="flex-1 flex flex-col overflow-hidden relative"
          ref={(el) => (containerRef = el)}
        >
          <Show when={viewMode() === "messages"}>
            <Show
              when={displayMessages().length > 0}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center p-12 text-zinc-500 text-sm text-center gap-1 italic opacity-60">
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
              />
            </Show>
          </Show>

          <Show when={viewMode() === "media"}>
            <MediaGallery
              messages={mediaMessages()}
              onImageClick={setLightboxSrc}
              onJumpToMessage={(id: string) => {
                setViewMode("messages");
                setTimeout(() => scrollToMessage(id), 50);
              }}
            />
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
            class="absolute top-6 right-6 w-12 h-12 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white transition-all active:scale-90 border border-white/10 shadow-2xl"
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
