import { Show } from "solid-js";
import type { Chat } from "../../types";
import {
  avatarBgColor,
  getInitials,
  extractJidId,
  profilePicUrl,
  getDisplayName,
} from "../../utils";
import { ArrowLeftIcon, TrashIcon, MessageSquareIcon, ImageIcon } from "../Icons";

interface ChatHeaderProps {
  chat: Chat | undefined;
  chatId: string;
  showOnlyDeleted: boolean;
  onShowOnlyDeletedChange: (_val: boolean) => void;
  viewMode: "messages" | "media";
  onViewModeChange: (_mode: "messages" | "media") => void;
  onBack: () => void;
}

export default function ChatHeader(props: ChatHeaderProps) {
  const displayName = () => getDisplayName(props.chat, props.chatId);
  const profileUrl = () => profilePicUrl(props.chat?.profile_pic);

  return (
    <header class="flex items-center gap-2 md:gap-3 px-3 md:p-4 py-2 bg-surface border-b border-border min-h-16 z-20 shrink-0">
      <button
        class="flex md:hidden items-center justify-center w-10 h-10 bg-surface border border-border text-text-secondary hover:text-text-primary rounded-full transition-all active:tick"
        onClick={() => props.onBack()}
        aria-label="Back"
      >
        <ArrowLeftIcon size={18} stroke-width={1.5} />
      </button>

      <div class="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <Show
          when={profileUrl()}
          fallback={
            <div
              class="w-9 h-9 md:w-10 md:h-10 min-w-9 md:min-w-10 rounded-lg flex items-center justify-center text-[11px] md:text-[12px] font-mono text-white uppercase"
              style={{ background: avatarBgColor(displayName()), opacity: 0.8 }}
            >
              {getInitials(displayName())}
            </div>
          }
        >
          <div
            class="relative w-9 h-9 md:w-10 md:h-10 min-w-9 md:min-w-10 rounded-lg flex items-center justify-center text-[11px] md:text-[12px] font-mono text-white uppercase overflow-hidden"
            style={{ background: avatarBgColor(displayName()), opacity: 0.8 }}
          >
            <span class="relative z-1">{getInitials(displayName())}</span>
            <img
              class="absolute inset-0 w-full h-full object-cover z-2"
              src={profileUrl()!}
              alt=""
              loading="lazy"
            />
          </div>
        </Show>

        <div class="flex-1 min-w-0">
          <h2 class="text-display text-[15px] md:text-[16px] truncate">
            {displayName()}
          </h2>
          <div class="text-[10px] md:text-metadata opacity-60 flex items-center gap-1.5 uppercase font-mono">
            <Show
              when={props.chat?.is_group}
              fallback={
                <span class="truncate">{extractJidId(props.chatId)}</span>
              }
            >
              <span class="text-accent">GROUP_CHAT</span>
            </Show>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 md:gap-4 ml-auto">
        <div
          class="flex bg-surface-raised border border-border rounded-full p-0.5"
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={props.viewMode === "messages"}
            class="px-3 md:px-5 py-1.5 text-[11px] font-mono font-bold transition-all flex items-center gap-2 rounded-full"
            classList={{
              "bg-text-display text-black": props.viewMode === "messages",
              "text-text-secondary hover:text-text-primary": props.viewMode !== "messages",
            }}
            onClick={() => props.onViewModeChange("messages")}
            title="Messages"
            aria-label="Messages"
          >
            <MessageSquareIcon size={14} class="md:hidden" />
            <span class="max-md:hidden">
              {props.viewMode === "messages" ? "[ CHATS ]" : "CHATS"}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={props.viewMode === "media"}
            class="px-3 md:px-5 py-1.5 text-[11px] font-mono font-bold transition-all flex items-center gap-2 rounded-full"
            classList={{
              "bg-text-display text-black": props.viewMode === "media",
              "text-text-secondary hover:text-text-primary": props.viewMode !== "media",
            }}
            onClick={() => props.onViewModeChange("media")}
            title="Media"
            aria-label="Media"
          >
            <ImageIcon size={14} class="md:hidden" />
            <span class="max-md:hidden">
              {props.viewMode === "media" ? "[ MEDIA ]" : "MEDIA"}
            </span>
          </button>
        </div>

        <button
          class="flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all active:tick text-[11px] font-mono font-bold"
          classList={{
            "bg-text-display border-text-display text-black": props.showOnlyDeleted,
            "bg-transparent border-border-visible text-text-secondary hover:text-text-primary": !props.showOnlyDeleted,
          }}
          onClick={() => props.onShowOnlyDeletedChange(!props.showOnlyDeleted)}
          title={props.showOnlyDeleted ? "Show all messages" : "Show only deleted messages"}
          aria-label={props.showOnlyDeleted ? "Show all messages" : "Show only deleted messages"}
        >
          <TrashIcon size={14} classList={{ "animate-in zoom-in-75 duration-200": props.showOnlyDeleted }} />
          <span class="max-md:hidden uppercase tracking-widest">
            {props.showOnlyDeleted ? "[ DELETED_ONLY ]" : "SHOW_DELETED"}
          </span>
        </button>
      </div>
    </header>
  );
}
