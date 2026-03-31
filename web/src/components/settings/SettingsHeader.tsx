import { ArrowLeftIcon } from "../Icons";

interface SettingsHeaderProps {
  onBack: () => void;
  search: string;
  onSearchChange: ( _val: string) => void;
}

export default function SettingsHeader(props: SettingsHeaderProps) {
  return (
    <header class="flex flex-col gap-4 p-6 pb-2 border-b border-white/5">
      <div class="flex items-center gap-4">
        <button
          class="w-10 h-10 flex items-center justify-center -ml-2 text-zinc-400 hover:bg-white/5 rounded-full transition-all active:scale-95"
          onClick={() => props.onBack()}
          title="Back"
          aria-label="Back to chats"
        >
          <ArrowLeftIcon size={20} />
        </button>
        <div>
          <h2 class="text-xl font-bold text-zinc-100 tracking-tight font-outfit">
            System Settings
          </h2>
          <p class="text-[13px] text-zinc-500 font-medium">
            Manage monitored chats and notification preferences.
          </p>
        </div>
      </div>

      <div class="relative flex items-center mt-2 group">
        <input
          type="text"
          placeholder="Search for chats or numbers..."
          value={props.search}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
          class="w-full p-3 px-4 bg-black/30 border border-white/10 rounded-xl text-zinc-100 font-inherit text-[14px] outline-none transition-all duration-300 focus-visible:border-accent focus-visible:bg-accent/5 focus-visible:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] placeholder:text-zinc-600"
        />
      </div>
    </header>
  );
}
