import { For, Show, createSignal } from "solid-js";
import type { WhatsAppChat } from "../../types";
import {
  avatarColor,
  getInitials,
  extractJidId,
  profilePicUrl,
  getDisplayName,
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
        <div class="flex items-stretch border-b border-border bg-surface/80  sticky top-0 z-10 overflow-x-auto no-scrollbar">
          <div class="flex border-r border-border">
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-mono font-bold transition-all uppercase tracking-[0.2em] border-r border-border"
              classList={{
                "bg-text-display text-black": props.filterType === "all",
                "text-text-disabled hover:text-text-primary": props.filterType !== "all",
              }}
              onClick={() => props.setFilterType("all")}
            >
              {props.filterType === "all" ? "[ ALL ]" : "ALL"}
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-mono font-bold transition-all uppercase tracking-[0.2em] border-r border-border"
              classList={{
                "bg-text-display text-black": props.filterType === "chats",
                "text-text-disabled hover:text-text-primary": props.filterType !== "chats",
              }}
              onClick={() => props.setFilterType("chats")}
            >
              {props.filterType === "chats" ? "[ GRP ]" : "GRP"}
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-mono font-bold transition-all uppercase tracking-[0.2em] border-r border-border md:border-r-0"
              classList={{
                "bg-text-display text-black": props.filterType === "contacts",
                "text-text-disabled hover:text-text-primary": props.filterType !== "contacts",
              }}
              onClick={() => props.setFilterType("contacts")}
            >
              {props.filterType === "contacts" ? "[ PRIV ]" : "PRIV"}
            </button>
          </div>

          <div class="flex border-l border-border ml-auto group">
            <button
              class="hidden sm:flex px-5 py-3 text-[10px] font-mono font-bold transition-all uppercase tracking-[0.2em] border-r border-border"
              classList={{
                "bg-text-display text-black": props.sortBy === "recent",
                "text-text-disabled hover:text-text-primary": props.sortBy !== "recent",
              }}
              onClick={() => props.setSortBy("recent")}
            >
              {props.sortBy === "recent" ? "[ RECENT ]" : "RECENT"}
            </button>
            <button
              class="px-4 md:px-5 py-2.5 md:py-3 text-[9px] md:text-[10px] font-mono font-bold transition-all uppercase tracking-[0.2em] border-r border-border"
              classList={{
                "bg-text-display text-black": props.sortBy === "name",
                "text-text-disabled hover:text-text-primary": props.sortBy !== "name",
              }}
              onClick={() => props.setSortBy("name")}
            >
              {props.sortBy === "name" ? "[ ALPHA ]" : "ALPHA"}
            </button>
            <button
              class="w-10 md:w-12 flex items-center justify-center hover:bg-surface-raised transition-all text-accent/60"
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
          <div class="flex flex-col items-center justify-center p-8 md:p-16 text-text-disabled gap-3 md:gap-4">
            <div class="flex gap-2">
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse" />
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse [animation-delay:0.2s]" />
              <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse [animation-delay:0.4s]" />
            </div>
            <span class="text-[9px] md:text-[10px] font-mono font-bold animate-pulse uppercase tracking-[0.3em] opacity-60">
              SYNCING_CHATS...
            </span>
          </div>
        </Show>

        <Show when={!props.loading && props.chats.length === 0}>
          <div class="flex flex-col items-center justify-center p-8 md:p-16 text-text-disabled text-center gap-2 border-b border-dashed border-border/50">
            <div class="text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-[0.2em]">
              NO CHATS FOUND
            </div>
            <div class="text-[8px] md:text-[9px] text-text-secondary uppercase tracking-widest leading-relaxed max-w-48 md:max-w-64">
              NO CONTACTS OR GROUPS DETECTED
            </div>
          </div>
        </Show>

        <For each={props.chats}>
          {(chat) => {
            const id = chat.chat_id || chat.id;
            const isAdded = () => props.monitoredIds?.has(id);
            const phone = () =>
              !(chat.isGroup ?? chat.is_group) ? extractJidId(id) : "";
            const isBusy = () => props.busy === id;
            const isConfirming = () => confirming() === id;
            const profileUrl = () => profilePicUrl(chat.profilePic || chat.profile_pic);

            return (
              <div class="group flex items-stretch border-b border-border hover:bg-surface-raised/20 transition-all duration-300 relative overflow-hidden">
                <Show when={isConfirming()}>
                  <div class="absolute inset-0 z-50 bg-surface/90 animate-in fade-in slide-in-from-right-4 duration-200 flex items-stretch">
                    <div class="flex-1 flex flex-col justify-center px-4 md:px-8">
                      <span class="text-[9px] md:text-[10px] font-mono font-bold text-accent uppercase tracking-[0.3em] mb-1">
                        REMOVE_MONITOR
                      </span>
                      <p class="text-[8px] md:text-[9px] text-text-secondary uppercase tracking-widest font-mono">
                        Irreversible record destruction possible.
                      </p>
                    </div>
                    <div class="flex border-l border-border">
                      <button
                        class="px-5 md:px-10 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] font-mono text-white bg-accent hover:brightness-110 transition-all border-r border-border active:scale-95"
                        onClick={() => {
                          props.onRemove(id);
                          setConfirming(null);
                        }}
                      >
                        REMOVE
                      </button>
                      <button
                        class="px-6 md:px-8 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-text-disabled hover:bg-surface-raised hover:text-text-primary transition-all"
                        onClick={() => setConfirming(null)}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                </Show>

                {/* Avatar/ID Section */}
                <div class="w-14 md:w-20 border-r border-border p-2 md:p-3 flex flex-col items-center justify-start gap-2 md:gap-3 bg-surface-raised/10">
                  <Show
                    when={profileUrl()}
                    fallback={
                      <div
                        class="w-8 h-8 md:w-10 md:h-10 border border-border flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white uppercase"
                        style={{ background: avatarColor(chat.name) }}
                      >
                        {getInitials(chat.name)}
                      </div>
                    }
                  >
                    <div
                      class="relative w-8 h-8 md:w-10 md:h-10 border border-border flex items-center justify-center text-[9px] md:text-[10px] font-bold text-white uppercase overflow-hidden "
                      style={{ background: avatarColor(chat.name) }}
                    >
                      <span class="relative z-1">{getInitials(chat.name)}</span>
                      <img
                        class="absolute inset-0 w-full h-full object-cover z-10 grayscale-[0.5] contrast-[1.1]"
                        src={profileUrl()!}
                        alt={`${chat.name || id} profile picture`}
                        width="40"
                        height="40"
                        onLoad={(e) => {
                          (e.currentTarget as HTMLImageElement).classList.remove("opacity-0");
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </Show>
                  <span class="text-[6px] md:text-[7px] font-mono text-text-disabled text-center truncate w-full tracking-tighter opacity-60">
                    {extractJidId(id)}
                  </span>
                </div>

                {/* Content Section */}
                <div class="flex-1 p-3 md:p-6 min-w-0 flex flex-col justify-center gap-1">
                  <div class="text-[12px] md:text-[14px] font-bold text-text-primary truncate uppercase tracking-[0.05em] font-mono">
                    {getDisplayName(chat)}
                  </div>
                  <div class="flex items-center gap-2 md:gap-3 no-scrollbar overflow-x-auto">
                    <Show when={phone() && chat.name !== phone()}>
                      <span class="text-[9px] md:text-[10px] font-mono text-text-secondary tracking-wider">
                        {phone()}
                      </span>
                    </Show>
                    <Show when={chat.lid}>
                      <span class="text-[7px] md:text-[8px] font-mono font-bold text-success border border-success/20 px-1 uppercase bg-success/5">
                        LID
                      </span>
                    </Show>
                    <span
                      class={`text-[7px] md:text-[8px] font-mono font-bold border px-1 uppercase ${(chat.isGroup ?? chat.is_group) ? "text-warning border-warning/20 bg-warning/5" : "text-interactive border-interactive/20 bg-interactive/5"}`}
                    >
                      {(chat.isGroup ?? chat.is_group) ? "GRP" : "PRIV"}
                    </span>
                  </div>
                </div>

                {/* Action Section */}
                <div class="border-l border-border flex flex-col items-stretch justify-center w-20 md:w-32 bg-surface-raised/10">
                  <Show
                    when={props.type === "available"}
                    fallback={
                      <button
                        class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-20"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => setConfirming(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "SYNC" : "REMOVE"}
                      </button>
                    }
                  >
                    <Show
                      when={isAdded()}
                      fallback={
                        <button
                          class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-success hover:bg-success hover:text-white transition-all disabled:opacity-20"
                          classList={{ "animate-pulse": isBusy() }}
                          onClick={() => props.onAdd?.(chat)}
                          disabled={isBusy()}
                        >
                          {isBusy() ? "LINK" : "MONITOR"}
                        </button>
                      }
                    >
                      <button
                        class="h-full px-2 md:px-4 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-text-disabled hover:bg-accent hover:text-white transition-all disabled:opacity-20"
                        classList={{ "animate-pulse": isBusy() }}
                        onClick={() => setConfirming(id)}
                        disabled={isBusy()}
                      >
                        {isBusy() ? "SYNC" : "ACTIVE"}
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
