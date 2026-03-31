import { Show } from "solid-js";
import type { Chat } from "../../types";
import {
  avatarColor,
  getInitials,
  extractPhone,
  profilePicUrl,
} from "../../utils";
import { ArrowLeftIcon, TrashIcon } from "../Icons";

interface ChatHeaderProps {
  chat: Chat | undefined;
  chatId: string;
  showOnlyDeleted: boolean;
  onShowOnlyDeletedChange: (val: boolean) => void;
  viewMode: "messages" | "media";
  onViewModeChange: (mode: "messages" | "media") => void;
  onBack: () => void;
}

export default function ChatHeader(props: ChatHeaderProps) {
  const displayName = () => props.chat?.name || props.chatId;

  return (
    <header class="flex items-center gap-4 px-5 py-3.5 bg-zinc-900/40 backdrop-blur-md border-b border-white/5 min-h-18 z-20 shrink-0">
      <button
        class="flex md:hidden items-center justify-center w-10 h-10 -ml-2 text-zinc-400 hover:bg-white/5 rounded-full transition-all active:scale-95"
        onClick={() => props.onBack()}
        aria-label="Back to chat list"
      >
        <ArrowLeftIcon size={20} />
      </button>

      <div class="flex items-center gap-3.5 flex-1 min-w-0">
        <Show
          when={profilePicUrl(props.chat?.profile_pic)}
          fallback={
            <div
              class="w-10 h-10 min-w-10 rounded-xl flex items-center justify-center text-sm font-bold text-white uppercase shadow-sm"
              style={{ background: avatarColor(displayName()) }}
            >
              {getInitials(displayName())}
            </div>
          }
        >
          <div
            class="relative w-10 h-10 min-w-10 rounded-xl flex items-center justify-center text-sm font-bold text-white uppercase overflow-hidden shadow-sm"
            style={{ background: avatarColor(displayName()) }}
          >
            <span class="relative z-1">{getInitials(displayName())}</span>
            <img
              class="absolute inset-0 w-full h-full object-cover z-10"
              src={profilePicUrl(props.chat?.profile_pic)!}
              alt=""
              width="40"
              height="40"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </Show>

        <div class="flex-1 min-w-0">
          <h2 class="text-[15px] font-semibold text-zinc-100 truncate tracking-tight">
            {displayName()}
          </h2>
          <div class="text-[11px] text-zinc-500 font-medium font-mono tabular-nums leading-tight flex items-center gap-1.5">
            <Show
              when={props.chat?.is_group}
              fallback={
                <>
                  <span class="max-md:hidden opacity-60">Private ·</span>
                  <span class="text-zinc-400">
                    {extractPhone(props.chatId)}
                  </span>
                </>
              }
            >
              <span class="opacity-60 text-emerald-500/80">Group ·</span>
              <span class="text-red-dim/80">
                {props.chat?.total_deleted_count ?? 0} deleted
              </span>
            </Show>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div
          class="flex bg-black/30 p-1 rounded-lg border border-white/5"
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={props.viewMode === "messages"}
            class="px-4 py-1.5 text-[12px] font-semibold rounded-md transition-all"
            classList={{
              "bg-zinc-800 text-white shadow-sm": props.viewMode === "messages",
              "text-text-3 hover:text-zinc-200": props.viewMode !== "messages",
            }}
            onClick={() => props.onViewModeChange("messages")}
          >
            Chats
          </button>
          <button
            role="tab"
            aria-selected={props.viewMode === "media"}
            class="px-4 py-1.5 text-[12px] font-semibold rounded-md transition-all"
            classList={{
              "bg-zinc-800 text-white shadow-sm": props.viewMode === "media",
              "text-text-3 hover:text-zinc-200": props.viewMode !== "media",
            }}
            onClick={() => props.onViewModeChange("media")}
          >
            Media
          </button>
        </div>

        <button
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border border-transparent"
          classList={{
            "bg-red-500/15 text-red-500 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]":
              props.showOnlyDeleted,
            "bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200":
              !props.showOnlyDeleted,
          }}
          onClick={() => props.onShowOnlyDeletedChange(!props.showOnlyDeleted)}
          title={
            props.showOnlyDeleted
              ? "Showing ONLY deleted messages"
              : "Showing all messages"
          }
        >
          <TrashIcon size={16} stroke-width={props.showOnlyDeleted ? 2.5 : 2} />
          <span class="text-[12px] font-bold uppercase tracking-wider max-md:hidden">
            {props.showOnlyDeleted ? "Deleted" : "Filter"}
          </span>
        </button>
      </div>
    </header>
  );
}
