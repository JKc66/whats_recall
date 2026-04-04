import { Show } from "solid-js";
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
  return (
    <div class="mt-8 md:mt-12 border-t border-accent/20 bg-accent/5">
      <div class="px-4 md:px-6 py-2 md:py-3 bg-accent/10 border-b border-accent/20 flex items-center justify-between">
        <h3 class="text-[9px] md:text-[10px] font-bold text-accent uppercase tracking-[0.2em] flex items-center gap-2">
          <AlertTriangleIcon size={12} stroke-width={2.5} />
          DESTRUCTIVE_ACTIONS
        </h3>
        <span class="text-[8px] md:text-[9px] text-accent/60 font-mono tracking-widest uppercase italic">DANGER_ZONE</span>
      </div>

      <div class="p-4 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 hover:bg-accent/10 transition-colors">
        <div class="flex flex-col gap-1 max-w-140 w-full md:w-auto">
          <div class="text-[12px] md:text-[14px] font-bold text-text-primary uppercase tracking-[0.05em] font-mono">
            DATA_WIPE
          </div>
          <div class="text-[8px] md:text-[9px] text-text-disabled uppercase tracking-widest font-mono leading-relaxed opacity-80">
            IRREVERSIBLE DATA REMOVAL
          </div>
        </div>
        <button
          class="w-full md:w-auto px-6 md:px-10 py-2.5 md:py-3 bg-accent hover:brightness-110 text-white font-bold text-[11px] md:text-[12px] uppercase tracking-[0.3em] font-mono transition-all active:scale-[0.98] disabled:opacity-20 flex items-center justify-center gap-2"
          disabled={props.clearing}
          onClick={() => props.onClearData()}
        >
          {props.clearing ? (
            <span class="animate-pulse">WIPING...</span>
          ) : (
            <>
              PERFORM_WIPE
            </>
          )}
        </button>
      </div>

      <Show when={props.confirmClear}>
        <div class="m-4 md:m-8 mt-0 p-4 md:p-6 border-2 border-accent bg-surface animate-in fade-in zoom-in-95 duration-300 relative z-20">
          <div class="absolute -top-3 left-4 bg-accent text-white px-2 md:px-3 py-1 text-[8px] md:text-[9px] font-bold uppercase tracking-widest">
            AUTHORIZATION
          </div>
          
          <div class="flex items-start gap-3 md:gap-4 mb-4 md:mb-6">
            <div class="p-2 md:p-3 bg-accent/10 text-accent">
              <AlertTriangleIcon size={20} />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[10px] md:text-[11px] font-bold text-accent uppercase tracking-widest font-mono">
                CONFIRM_IDENTITY
              </span>
              <p class="text-[9px] md:text-[10px] text-text-secondary uppercase tracking-wider leading-relaxed">
                Enter password to confirm irreversible data deletion.
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3 md:gap-4">
            <div class="grid grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] border border-border focus-within:border-accent transition-colors bg-surface-raised/20">
              <div class="border-r border-border p-3 md:p-4 flex items-center text-[8px] md:text-[9px] tracking-[0.2em] text-text-disabled font-bold uppercase font-mono bg-surface-raised/50">
                PASSWORD
              </div>
              <input
                type="password"
                placeholder="/// **********"
                value={props.clearPassword}
                onInput={(e) => props.onSetClearPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onConfirmClearData()}
                aria-label="Confirm password for data deletion"
                autofocus
                class="w-full bg-transparent p-3 md:p-4 outline-none text-sm tracking-[0.5em] placeholder:opacity-20 font-mono text-text-primary"
              />
            </div>
            
            <div class="flex flex-col sm:flex-row items-stretch gap-3 md:gap-4">
              <button
                class="flex-1 py-4 bg-transparent border border-accent text-accent hover:bg-accent hover:text-white font-bold text-[12px] md:text-[13px] uppercase tracking-[0.2em] font-mono transition-all disabled:opacity-20 rounded-full active:tick"
                disabled={!props.clearPassword}
                onClick={() => props.onConfirmClearData()}
              >
                ERASE_ALL_DATA
              </button>
              <button
                class="px-8 md:px-12 py-4 bg-transparent border border-border-visible text-text-primary hover:bg-surface-raised font-bold text-[12px] md:text-[13px] uppercase tracking-[0.2em] font-mono transition-all active:tick rounded-full"
                onClick={() => props.onCancelClear()}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
