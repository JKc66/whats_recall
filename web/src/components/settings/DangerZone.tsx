import { Show, createEffect } from "solid-js";
import { AlertTriangleIcon } from "../Icons";

interface DangerZoneProps {
  clearing: boolean;
  confirmClear: boolean;
  clearPassword: string;
  onClearData: () => void;
  onConfirmClearData: () => void;
  onSetClearPassword: (_val: string) => void;
  onCancelClear: () => void;
}

export default function DangerZone(props: DangerZoneProps) {
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.confirmClear && containerRef) {
      setTimeout(() => {
        containerRef?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  });

  return (
    <div 
      ref={containerRef}
      class="mt-12 mb-16 border border-accent/20 bg-accent/5 mx-4 md:mx-6 rounded-sm overflow-hidden transition-all duration-500"
      classList={{ "ring-4 ring-accent/10 border-accent/40": props.confirmClear }}
    >
      <div 
        class="px-4 md:px-6 py-2 md:py-3 border-b flex items-center justify-between transition-colors duration-300"
        classList={{ "bg-accent/20 border-accent/40": props.confirmClear, "bg-accent/10 border-accent/20": !props.confirmClear }}
      >
        <h3 class="text-[9px] md:text-[10px] font-bold text-accent uppercase tracking-[0.2em] flex items-center gap-2">
          <AlertTriangleIcon size={12} stroke-width={2.5} classList={{ "animate-pulse": props.confirmClear }} />
          DESTRUCTIVE_ACTIONS
        </h3>
        <span class="text-[8px] md:text-[9px] text-accent/60 font-mono tracking-widest uppercase italic">
          {props.confirmClear ? "AUTHORIZATION_REQUIRED" : "DANGER_ZONE"}
        </span>
      </div>

      <div class="relative min-h-35 flex items-stretch">
        <Show 
          when={!props.confirmClear}
          fallback={
            <div class="w-full bg-surface-raised p-4 md:p-6 animate-in fade-in zoom-in-95 duration-300">
              <div class="flex flex-col md:flex-row items-center gap-4 md:gap-8 max-w-4xl mx-auto">
                <div class="flex flex-col gap-1 flex-1 text-center md:text-left">
                  <span class="text-[11px] md:text-[12px] font-bold text-accent uppercase tracking-widest font-mono">
                    CONFIRM_IDENTITY
                  </span>
                  <p class="text-[9px] md:text-[10px] text-text-secondary uppercase tracking-wider leading-relaxed">
                    ENTER PASSWORD TO CONFIRM IRREVERSIBLE DELETION.
                  </p>
                </div>

                <div class="flex flex-col gap-3 w-full md:w-auto min-w-70">
                  <div class="grid grid-cols-[80px_1fr] border border-border focus-within:border-accent transition-colors bg-surface h-12">
                    <div class="border-r border-border flex items-center justify-center text-[9px] tracking-widest text-text-disabled font-bold uppercase font-mono bg-surface/50">
                      PASS
                    </div>
                    <input
                      type="password"
                      placeholder="/// **********"
                      value={props.clearPassword}
                      onInput={(e) => props.onSetClearPassword(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === "Enter" && props.onConfirmClearData()}
                      aria-label="Confirm password for data deletion"
                      autofocus
                      class="w-full bg-transparent px-4 outline-none text-sm tracking-[0.4em] placeholder:opacity-20 font-mono text-text-primary h-full"
                    />
                  </div>
                  
                  <div class="flex items-center gap-2">
                    <button
                      class="btn btn-destructive text-[11px] flex-1 py-3"
                      disabled={!props.clearPassword || props.clearing}
                      onClick={() => props.onConfirmClearData()}
                    >
                      ERASE_DATA
                    </button>
                    <button
                      class="btn btn-secondary text-[11px] px-6 py-3"
                      onClick={() => props.onCancelClear()}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          }
        >
          <div class="w-full p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 bg-surface">
            <div class="flex flex-col gap-1 flex-1 items-center md:items-start text-center md:text-left">
              <div class="text-[12px] md:text-[14px] font-bold text-text-primary uppercase tracking-[0.05em] font-mono">
                DATA_WIPE
              </div>
              <div class="text-[8px] md:text-[9px] text-text-disabled uppercase tracking-widest font-mono leading-relaxed opacity-80">
                IRREVERSIBLE DATA REMOVAL
              </div>
            </div>
            <button
              class="btn bg-accent text-white hover:bg-accent/90 border border-accent w-full md:w-auto min-w-48 text-[11px] md:text-[13px] uppercase font-bold tracking-widest"
              disabled={props.clearing}
              onClick={() => props.onClearData()}
            >
              {props.clearing ? (
                <span class="animate-pulse">WIPING...</span>
              ) : (
                "PERFORM_WIPE"
              )}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
