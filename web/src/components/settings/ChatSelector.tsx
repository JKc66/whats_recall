import { For, Show } from "solid-js";
import type { WhatsAppChat } from "../../types";
import {
  avatarColor,
  getInitials,
  extractPhone,
  profilePicUrl,
} from "../../utils";
import { RefreshIcon } from "../Icons";

interface ChatSelectorProps {
  type: "monitored" | "available";
  chats: any[];
  monitoredIds?: Set<string>;
  loading: boolean;
  busy: string | null;
  onAdd?: (_chat: WhatsAppChat) => void;
  onRemove: (_chatId: string) => void;
  onRefetch?: () => void;
  filterType: "all" | "chats" | "contacts";
  setFilterType: (_val: "all" | "chats" | "contacts") => void;
  sortBy: "recent" | "name";
  setSortBy: (_val: "recent" | "name") => void;
}

export default function ChatSelector(props: ChatSelectorProps) {
  return (
    <div class="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Show when={props.type === "available"}>
        <div class="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 border-b border-white/10 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10 overflow-x-auto no-scrollbar">
          <div class="flex bg-black/40 p-1 rounded-full border border-white/5 shrink-0">
            <button
              class="px-2.5 md:px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full transition-all uppercase tracking-wider"
              classList={{
                "bg-zinc-800 text-white shadow-sm": props.filterType === "all",
                "text-zinc-500 hover:text-zinc-300": props.filterType !== "all",
              }}
              onClick={() => props.setFilterType("all")}
            >
              All
            </button>
            <button
              class="px-2.5 md:px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full transition-all uppercase tracking-wider"
              classList={{
                "bg-zinc-800 text-white shadow-sm":
                  props.filterType === "chats",
                "text-zinc-500 hover:text-zinc-300":
                  props.filterType !== "chats",
              }}
              onClick={() => props.setFilterType("chats")}
            >
              Groups
            </button>
            <button
              class="px-2.5 md:px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full transition-all uppercase tracking-wider"
              classList={{
                "bg-zinc-800 text-white shadow-sm":
                  props.filterType === "contacts",
                "text-zinc-500 hover:text-zinc-300":
                  props.filterType !== "contacts",
              }}
              onClick={() => props.setFilterType("contacts")}
            >
              Direct
            </button>
          </div>

          <div class="flex bg-black/40 p-1 rounded-full border border-white/5 shrink-0 ml-auto">
            <button
              class="px-2.5 md:px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full transition-all uppercase tracking-wider"
              classList={{
                "bg-zinc-800 text-white shadow-sm": props.sortBy === "recent",
                "text-zinc-500 hover:text-zinc-300": props.sortBy !== "recent",
              }}
              onClick={() => props.setSortBy("recent")}
            >
              Recent
            </button>
            <button
              class="px-2.5 md:px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full transition-all uppercase tracking-wider"
              classList={{
                "bg-zinc-800 text-white shadow-sm": props.sortBy === "name",
                "text-zinc-500 hover:text-zinc-300": props.sortBy !== "name",
              }}
              onClick={() => props.setSortBy("name")}
            >
              Name
            </button>
          </div>

          <button
            class="w-7 h-7 flex items-center justify-center text-zinc-400 hover:bg-white/5 rounded-full transition-all shrink-0"
            onClick={() => props.onRefetch?.()}
            title="Force refresh list"
          >
            <RefreshIcon
              size={14}
              class={props.loading ? "animate-pulse opacity-50" : ""}
            />
          </button>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto px-2 md:px-4 py-2 md:py-4 space-y-1">
        <Show when={props.loading}>
          <div class="flex flex-col items-center justify-center p-12 text-zinc-500 gap-3">
            <div class="flex gap-1.5">
              <div class="w-1.5 h-1.5 rounded-full bg-accent animate-dot-pulse" />
              <div class="w-1.5 h-1.5 rounded-full bg-accent animate-dot-pulse [animation-delay:0.2s]" />
              <div class="w-1.5 h-1.5 rounded-full bg-accent animate-dot-pulse [animation-delay:0.4s]" />
            </div>
            <span class="text-[12px] font-medium animate-pulse uppercase tracking-wider opacity-60">
              Scanning WhatsApp...
            </span>
          </div>
        </Show>

        <Show when={!props.loading && props.chats.length === 0}>
          <div class="flex flex-col items-center justify-center p-12 text-zinc-500 text-center gap-1">
            <div class="text-[12px] font-bold text-zinc-400 uppercase tracking-widest opacity-60">
              No results found
            </div>
          </div>
        </Show>

        <For each={props.chats}>
          {(chat) => {
            const id = chat.chat_id || chat.id;
            const isAdded = () => props.monitoredIds?.has(id);
            const phone = () =>
              !(chat.isGroup ?? chat.is_group) ? extractPhone(id) : "";
            const isBusy = () => props.busy === id;

            return (
              <div class="group flex items-center gap-2.5 p-2 md:p-3 rounded-xl border border-transparent hover:bg-white/3 hover:border-white/5 transition-all duration-200">
                <Show
                  when={profilePicUrl(chat.profilePic || chat.profile_pic)}
                  fallback={
                    <div
                      class="w-8 h-8 md:w-10 md:h-10 min-w-8 md:min-w-10 rounded-lg md:rounded-xl flex items-center justify-center text-[10px] md:text-sm font-bold text-white uppercase shadow-inner"
                      style={{ background: avatarColor(chat.name) }}
                    >
                      {getInitials(chat.name)}
                    </div>
                  }
                >
                  <div
                    class="relative w-8 h-8 md:w-10 md:h-10 min-w-8 md:min-w-10 rounded-lg md:rounded-xl flex items-center justify-center text-[10px] md:text-sm font-bold text-white uppercase overflow-hidden shadow-inner"
                    style={{ background: avatarColor(chat.name) }}
                  >
                    <span class="relative z-1">{getInitials(chat.name)}</span>
                    <img
                      class="absolute inset-0 w-full h-full object-cover z-10"
                      src={profilePicUrl(chat.profilePic || chat.profile_pic)!}
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
                  <div class="text-[14px] font-bold text-zinc-100 truncate group-hover:text-accent transition-colors">
                    {chat.name}
                  </div>
                  <div class="flex items-center gap-2 mt-0.5 no-scrollbar overflow-x-auto">
                    <Show when={phone() && chat.name !== phone()}>
                      <span class="text-[11px] font-mono text-zinc-500">
                        {phone()}
                      </span>
                    </Show>
                    <Show when={chat.lid}>
                      <span class="text-[10px] font-mono text-emerald-500/60 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 shrink-0">
                        LID
                      </span>
                    </Show>
                    <span
                      class={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${(chat.isGroup ?? chat.is_group) ? "text-amber-500/80 bg-amber-500/5 border border-amber-500/10" : "text-blue-500/80 bg-blue-500/5 border border-blue-500/10"}`}
                    >
                      {(chat.isGroup ?? chat.is_group) ? "Group" : "Private"}
                    </span>
                  </div>
                </div>

                <div class="shrink-0 flex items-center gap-2">
                  <Show
                    when={props.type === "available"}
                    fallback={
                      <button
                        class="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => props.onRemove(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "Busy" : "Unmonitor"}
                      </button>
                    }
                  >
                    <Show
                      when={isAdded()}
                      fallback={
                        <button
                          class="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20 hover:bg-accent hover:text-white transition-all disabled:opacity-50 shadow-sm"
                          classList={{ "animate-pulse": isBusy() }}
                          onClick={() => props.onAdd?.(chat)}
                          disabled={isBusy()}
                        >
                          {isBusy() ? "Busy" : "Monitor"}
                        </button>
                      }
                    >
                      <button
                        class="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-white/5 text-zinc-500 border border-white/10 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all disabled:opacity-50"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => props.onRemove(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "Busy" : "Added"}
                      </button>
                    </Show>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
