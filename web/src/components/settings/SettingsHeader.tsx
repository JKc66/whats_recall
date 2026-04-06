import { Show } from "solid-js";
import { ArrowLeftIcon } from "../Icons";

interface SettingsHeaderProps {
  onBack: () => void;
  search: string;
  onSearchChange: (_val: string) => void;
  stats?: any; // Keep the prop but don't use it for the pic
  showSearch?: boolean;
}

export default function SettingsHeader(props: SettingsHeaderProps) {
  return (
    <header class="flex flex-col border-b border-border bg-surface relative z-10">
      <div class="flex items-stretch">
        <button
          class="w-16 border-r border-border flex items-center justify-center text-text-secondary hover:bg-surface-raised transition-all active:tick group shrink-0"
          onClick={() => props.onBack()}
          title="Back"
          aria-label="Back to chats"
        >
          <ArrowLeftIcon size={18} class="group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <div class="flex-1 p-4 md:p-8 flex flex-col gap-1 min-w-0">
          <div class="flex items-center gap-3 mb-0.5 md:mb-1">
            <div class="w-1.5 h-1.5 bg-accent" />
            <h2 class="text-metadata text-accent">
              SETTINGS
            </h2>
          </div>
          <h1 class="text-display-md md:text-display-lg uppercase line-clamp-1">
            CONFIGURATION
          </h1>
        </div>
      </div>

      <Show when={props.showSearch}>
        <div class="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr] border-t border-border group focus-within:bg-border/5 transition-colors">
          <div class="border-r border-border p-3 md:p-4 text-metadata uppercase text-text-disabled flex items-center justify-center font-mono">
            SEARCH
          </div>
          <input
            type="text"
            placeholder="SEARCH_CONTACTS..."
            value={props.search}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            spellcheck={false}
            aria-label="Search settings"
            class="w-full bg-transparent p-3 md:p-4 outline-none text-[11px] md:text-[13px] font-mono tracking-widest placeholder:text-text-disabled/40 uppercase text-text-primary"
          />
        </div>
      </Show>
    </header>
  );
}
