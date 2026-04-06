import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { TrashIcon, ShieldIcon } from "../Icons";

export default function RelayPreview() {
  const [step, setStep] = createSignal(0);

  onMount(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 2500);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <div class="mt-4 border border-border-visible bg-black overflow-hidden rounded-xl animate-in fade-in zoom-in-95 duration-500">
      <div class="px-4 py-2.5 border-b border-border-visible flex items-center justify-between bg-surface-raised/50">
        <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span class="text-[10px] font-bold font-mono tracking-[0.2em] text-text-secondary uppercase">LIVE_DEMO</span>
        </div>
        <div class="text-[8px] font-mono text-text-disabled tracking-widest uppercase opacity-70">DELETED_MESSAGE_INTERCEPTION</div>
      </div>

      <div class="p-4 md:p-6 flex flex-col gap-6 bg-surface/30">
        {/* Chat 1: Generic Conversation */}
        <div class="flex flex-col gap-3">
            <div class="text-[9px] font-mono text-text-disabled uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                <div class="w-6 h-px bg-border-visible" />
                CHAT_WITH_SENDER
            </div>
            
            <div class="self-start max-w-[85%] bg-surface border border-border rounded-lg p-3 animate-in fade-in slide-in-from-left-2 duration-500">
                <div class="text-accent text-[10px] font-bold mb-1 uppercase tracking-tight">Alice</div>
                <div class="text-[13px] text-text-primary leading-relaxed">Hey! Can we talk about the project?</div>
                <div class="text-[9px] text-text-disabled text-right mt-1 font-mono tabular-nums opacity-60">14:02</div>
            </div>

            <Show when={step() >= 1}>
                <div class="self-start max-w-[85%] bg-surface border border-border rounded-lg p-3 transition-all duration-700 ease-out"
                     classList={{ "opacity-40 border-dashed bg-accent/5 border-accent/20": step() >= 2 }}>
                    <div class="text-accent text-[10px] font-bold mb-1 uppercase tracking-tight">Alice</div>
                    <Show when={step() === 1}>
                        <div class="text-[13px] text-text-primary leading-relaxed animate-in fade-in slide-in-from-left-2 duration-500">
                            Wait, never mind, I found the bug! 🐛
                        </div>
                    </Show>
                    <Show when={step() >= 2}>
                        <div class="flex items-center gap-2 text-[12px] text-text-disabled italic font-medium py-0.5">
                            <TrashIcon size={14} class="text-accent/60" />
                            <span class="tracking-tight">This message was deleted</span>
                        </div>
                    </Show>
                    <div class="text-[9px] text-text-disabled text-right mt-1 font-mono tabular-nums opacity-60">14:03</div>
                </div>
            </Show>
        </div>

        {/* Chat 2: The Relay */}
        <div class="min-h-30 flex flex-col justify-end">
            <Show when={step() >= 3}>
                <div class="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
                    <div class="text-[9px] font-mono text-accent uppercase tracking-[0.2em] mb-1 flex items-center gap-2 justify-end">
                        SYSTEM_RELAY (PRIVATE_LOG)
                        <ShieldIcon size={10} class="text-accent" />
                        <div class="w-6 h-px bg-accent/30" />
                    </div>
                    
                    <div class="self-end max-w-[90%] bg-surface-raised border border-accent/40 rounded-lg p-4 relative overflow-hidden shadow-2xl shadow-accent/5">
                        <div class="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                        <div class="text-[10px] font-bold text-accent uppercase mb-2 tracking-widest flex items-center gap-2 leading-none">
                             <span class="flex items-center gap-1.5">
                                <TrashIcon size={12} />
                                RECOVERED [Alice] @ 14:03
                             </span>
                             <div class="h-px flex-1 bg-accent/20" />
                        </div>
                        <div class="bg-black/60 rounded-md p-3 border border-border-visible/50 mb-2.5">
                            <div class="text-accent/80 text-[10px] font-mono mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                                <div class="w-1 h-1 bg-accent rounded-full" />
                                FROM: Alice
                            </div>
                            <div class="text-[13px] text-text-primary leading-relaxed">
                                Wait, never mind, I found the bug! 🐛
                            </div>
                        </div>
                        <div class="text-[9px] text-text-disabled font-mono flex justify-between uppercase tracking-widest opacity-60">
                            <span>AUTO_ARCHIVE</span>
                            <span class="tabular-nums">14:03</span>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
      </div>
      
      <div class="p-4 border-t border-border-visible flex items-center justify-between bg-black/80">
        <div class="flex gap-2">
            <For each={[0, 1, 2, 3]}>
                {(i) => (
                    <div class={`h-1 rounded-full transition-all duration-500 ease-in-out ${step() === i ? "w-8 bg-accent" : "w-2 bg-border-visible opacity-50"}`} />
                )}
            </For>
        </div>
        <span class="text-[9px] font-mono text-text-disabled uppercase tracking-[0.2em]">
            STEP {step() + 1} OF 4
        </span>
      </div>
    </div>
  );
}
