import { ArrowLeftIcon } from "../Icons";

interface SettingsHeaderProps {
  onBack: () => void;
  search: string;
  onSearchChange: (_val: string) => void;
  stats?: any; // Keep the prop but don't use it for the pic
}

export default function SettingsHeader(props: SettingsHeaderProps) {
  return (
    <header class="flex flex-col border-b border-white/10 bg-white/2">
      <div class="flex items-stretch">
        <button
          class="w-16 border-r border-white/10 flex items-center justify-center text-zinc-400 hover:bg-white/5 transition-all active:scale-95 group shrink-0"
          onClick={() => props.onBack()}
          title="Back"
          aria-label="Back to chats"
        >
          <ArrowLeftIcon size={18} class="group-hover:-translate-x-0.5 transition-transform" />
        </button>
        
        <div class="flex-1 p-6 md:p-8 flex flex-col gap-1 min-w-0">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-2 h-2 bg-red-600 shadow-[0_0_8px_rgba(230,25,25,0.4)]" />
            <h2 class="text-[10px] font-bold text-red-600 uppercase tracking-[0.3em] font-mono">
              System_Registry // Kernel
            </h2>
          </div>
          <h1 class="text-3xl md:text-5xl font-black font-sans leading-none tracking-[-0.04em] uppercase text-[#EAEAEA] truncate">
            Core_System<br/>Controller
          </h1>
        </div>
      </div>

      <div class="grid grid-cols-[120px_1fr] border-t border-white/10 group focus-within:bg-white/2 transition-colors">
        <div class="border-r border-white/10 p-4 flex items-center text-[9px] tracking-[0.2em] opacity-40 font-bold uppercase font-mono">
          Query_Search
        </div>
        <input
          type="text"
          placeholder="/// INPUT_REGISTRY_KEY_OR_ALIAS"
          value={props.search}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Search chats"
          class="w-full bg-transparent p-4 outline-none text-sm tracking-widest placeholder:opacity-20 uppercase font-mono text-[#EAEAEA]"
        />
      </div>
    </header>
  );
}
