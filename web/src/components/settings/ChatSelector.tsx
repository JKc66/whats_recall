import { For, Show, createSignal } from "solid-js";
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
  const [confirming, setConfirming] = createSignal<string | null>(null);

  return (
    <div class="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Show when={props.type === "available"}>
        <div class="flex items-stretch border-b border-white/10 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10 overflow-x-auto no-scrollbar">
          <div class="flex border-r border-white/10">
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10"
              classList={{
                "bg-white/10 text-red-500": props.filterType === "all",
                "text-zinc-500 hover:text-zinc-300": props.filterType !== "all",
              }}
              onClick={() => props.setFilterType("all")}
            >
              ALL
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10"
              classList={{
                "bg-white/10 text-red-500": props.filterType === "chats",
                "text-zinc-500 hover:text-zinc-300": props.filterType !== "chats",
              }}
              onClick={() => props.setFilterType("chats")}
            >
              GRPS
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10 md:border-r-0"
              classList={{
                "bg-white/10 text-red-500": props.filterType === "contacts",
                "text-zinc-500 hover:text-zinc-300": props.filterType !== "contacts",
              }}
              onClick={() => props.setFilterType("contacts")}
            >
              PRIV
            </button>
          </div>

          <div class="flex border-l border-white/10 ml-auto group">
            <button
              class="hidden sm:flex px-5 py-3 text-[10px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10"
              classList={{
                "bg-white/10 text-red-500": props.sortBy === "recent",
                "text-zinc-500 hover:text-zinc-300": props.sortBy !== "recent",
              }}
              onClick={() => props.setSortBy("recent")}
            >
              RECENT
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10"
              classList={{
                "bg-white/10 text-red-500": props.sortBy === "name",
                "text-zinc-500 hover:text-zinc-300": props.sortBy !== "name",
              }}
              onClick={() => props.setSortBy("name")}
            >
              ALPHA
            </button>
            <button
              class="w-10 md:w-12 flex items-center justify-center hover:bg-white/5 transition-all text-red-600/60"
              onClick={() => props.onRefetch?.()}
              title="Force sync list"
            >
              <RefreshIcon
                size={14}
                class={props.loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}
              />
            </button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <Show when={props.loading}>
          <div class="flex flex-col items-center justify-center p-8 md:p-16 text-zinc-500 gap-3 md:gap-4">
            <div class="flex gap-2">
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse" />
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse [animation-delay:0.2s]" />
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse [animation-delay:0.4s]" />
            </div>
            <span class="text-[9px] md:text-[10px] font-mono font-bold animate-pulse uppercase tracking-[0.3em] opacity-40">
              SCRAPING_DATA...
            </span>
          </div>
        </Show>

        <Show when={!props.loading && props.chats.length === 0}>
          <div class="flex flex-col items-center justify-center p-8 md:p-16 text-zinc-600 text-center gap-2 border-b border-dashed border-white/5">
            <div class="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-[0.2em]">
              [ ERR: NO_NODES ]
            </div>
            <div class="text-[8px] md:text-[9px] text-zinc-700 uppercase tracking-widest leading-relaxed max-w-48 md:max-w-64">
              Zero responsive entries detected.
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
            const isConfirming = () => confirming() === id;
            const profileUrl = profilePicUrl(chat.profilePic || chat.profile_pic);

            return (
              <div class="group flex items-stretch border-b border-white/10 hover:bg-white/1 transition-all duration-300 relative overflow-hidden">
                <Show when={isConfirming()}>
                  <div class="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-200 flex items-stretch">
                    <div class="flex-1 flex flex-col justify-center px-4 md:px-8">
                      <span class="text-[9px] md:text-[10px] font-mono font-bold text-red-500 uppercase tracking-[0.3em] mb-1">
                        SYSTEM_DETACH_REQ
                      </span>
                      <p class="text-[8px] md:text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
                        Irreversible record destruction possible.
                      </p>
                    </div>
                    <div class="flex border-l border-white/10">
                      <button
                        class="px-5 md:px-10 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] font-mono text-white bg-red-600 hover:bg-red-700 transition-all border-r border-white/10 active:scale-95"
                        onClick={() => {
                          props.onRemove(id);
                          setConfirming(null);
                        }}
                      >
                        CONFIRM_WIPE
                      </button>
                      <button
                        class="px-6 md:px-8 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-zinc-500 hover:bg-white/5 hover:text-white transition-all"
                        onClick={() => setConfirming(null)}
                      >
                        ABORT_CMD
                      </button>
                    </div>
                  </div>
                </Show>

                {/* Avatar/ID Section */}
                <div class="w-14 md:w-20 border-r border-white/10 p-2 md:p-3 flex flex-col items-center justify-start gap-2 md:gap-3 bg-white/1">
                  <Show
                    when={profileUrl}
                    fallback={
                      <div
                        class="w-8 h-8 md:w-10 md:h-10 border border-white/10 flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white uppercase"
                        style={{ background: avatarColor(chat.name) }}
                      >
                        {getInitials(chat.name)}
                      </div>
                    }
                  >
                    <div
                      class="relative w-8 h-8 md:w-10 md:h-10 border border-white/10 flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white uppercase overflow-hidden"
                      style={{ background: avatarColor(chat.name) }}
                    >
                      <span class="relative z-1">{getInitials(chat.name)}</span>
                      <img
                        class="absolute inset-0 w-full h-full object-cover z-10 grayscale contrast-125"
                        src={profileUrl!}
                        alt=""
                        width="40"
                        height="40"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </Show>
                  <span class="text-[6px] md:text-[7px] font-mono opacity-30 text-center truncate w-full tracking-tighter">
                    {id.split("@")[0]}
                  </span>
                </div>

                {/* Content Section */}
                <div class="flex-1 p-3 md:p-6 min-w-0 flex flex-col justify-center gap-1">
                  <div class="text-[12px] md:text-[14px] font-bold text-[#EAEAEA] truncate uppercase tracking-[0.05em] font-mono">
                    {chat.name}
                  </div>
                  <div class="flex items-center gap-2 md:gap-3 no-scrollbar overflow-x-auto">
                    <Show when={phone() && chat.name !== phone()}>
                      <span class="text-[9px] md:text-[10px] font-mono text-zinc-500 tracking-wider">
                        {phone()}
                      </span>
                    </Show>
                    <Show when={chat.lid}>
                      <span class="text-[7px] md:text-[8px] font-mono font-bold text-emerald-500/80 border border-emerald-500/20 px-1 uppercase">
                        LID
                      </span>
                    </Show>
                    <span
                      class={`text-[7px] md:text-[8px] font-mono font-bold border px-1 uppercase ${(chat.isGroup ?? chat.is_group) ? "text-amber-500/80 border-amber-500/20 bg-amber-500/5" : "text-blue-500/80 border-blue-500/20 bg-blue-500/5"}`}
                    >
                      {(chat.isGroup ?? chat.is_group) ? "GRP" : "PRIV"}
                    </span>
                  </div>
                </div>

                {/* Action Section */}
                <div class="border-l border-white/10 flex flex-col items-stretch justify-center w-20 md:w-32 bg-white/1">
                  <Show
                    when={props.type === "available"}
                    fallback={
                      <button
                        class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-red-500 hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => setConfirming(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "WORK" : "DETACH"}
                      </button>
                    }
                  >
                    <Show
                      when={isAdded()}
                      fallback={
                        <button
                          class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-emerald-500 hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20"
                          classList={{ "animate-pulse": isBusy() }}
                          onClick={() => props.onAdd?.(chat)}
                          disabled={isBusy()}
                        >
                          {isBusy() ? "LINK" : "MONITOR"}
                        </button>
                      }
                    >
                      <button
                        class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-zinc-500 hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => setConfirming(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "WORK" : "LINKED"}
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
