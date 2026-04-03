import { ArrowLeftIcon } from "../Icons";

interface SettingsHeaderProps {
  onBack: () => void;
  search: string;
  onSearchChange: (_val: string) => void;
  stats?: any; // Keep the prop but don't use it for the pic
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

        <div class="flex-1 p-6 md:p-8 flex flex-col gap-1 min-w-0">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 bg-accent shadow-[0_0_8px_var(--color-accent)]" />
            <h2 class="text-label text-accent">
              System_Registry // Kernel
            </h2>
          </div>
          <h1 class="text-display text-4xl md:text-5xl uppercase">
            Core_System<br />Controller
          </h1>
        </div>
      </div>

      <div class="grid grid-cols-[120px_1fr] border-t border-border group focus-within:bg-border/5 transition-colors">
        <div class="border-r border-border p-4 text-metadata uppercase text-text-disabled">
          Query_Search
        </div>
        <input
          type="text"
          placeholder="INPUT_REGISTRY_KEY_OR_ALIAS"
          value={props.search}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
          class="w-full bg-transparent p-4 outline-none text-[13px] font-mono tracking-widest placeholder:text-text-disabled/40 uppercase text-text-primary"
        />
      </div>
    </header>
  );
}
