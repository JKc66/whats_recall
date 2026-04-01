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
    <div class="mt-8 md:mt-12 border-t border-red-600/20 bg-red-600/2">
      <div class="px-4 md:px-6 py-2 md:py-3 bg-red-600/10 border-b border-red-600/20 flex items-center justify-between">
        <h3 class="text-[9px] md:text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <AlertTriangleIcon size={12} stroke-width={2.5} />
          DESTRUCTIVE_PROTOCOL
        </h3>
        <span class="text-[8px] md:text-[9px] text-red-600/40 font-mono tracking-widest uppercase italic">HIGH_RISK</span>
      </div>

      <div class="p-4 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 hover:bg-red-600/5 transition-colors">
        <div class="flex flex-col gap-1 max-w-140 w-full md:w-auto">
          <div class="text-[12px] md:text-[14px] font-bold text-[#EAEAEA] uppercase tracking-[0.05em] font-mono">
            SYS_WIPE // DATA_PURGE
          </div>
          <div class="text-[8px] md:text-[9px] text-zinc-500 uppercase tracking-widest font-mono leading-relaxed">
            [ ACTION: IRREVERSIBLE_DELETION ]
          </div>
        </div>
        <button
          class="w-full md:w-auto px-6 md:px-10 py-2.5 md:py-3 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] md:text-[12px] uppercase tracking-[0.3em] font-mono transition-all active:scale-[0.98] disabled:opacity-20 flex items-center justify-center gap-2"
          disabled={props.clearing}
          onClick={() => props.onClearData()}
        >
          {props.clearing ? (
            <span class="animate-pulse">PURGING...</span>
          ) : (
            <>
              Execute_Wipe
              <span class="text-[8px] opacity-40">®</span>
            </>
          )}
        </button>
      </div>

      <Show when={props.confirmClear}>
        <div class="m-4 md:m-8 mt-0 p-4 md:p-6 border-2 border-red-600 bg-black animate-in fade-in zoom-in-95 duration-300 shadow-[0_0_40px_rgba(230,25,25,0.15)] relative">
          <div class="absolute -top-3 left-4 bg-red-600 text-black px-2 md:px-3 py-1 text-[8px] md:text-[9px] font-black uppercase tracking-widest">
            ADMIN_AUTH
          </div>
          
          <div class="flex items-start gap-3 md:gap-4 mb-4 md:mb-6">
            <div class="p-2 md:p-3 bg-red-600/10 text-red-500">
              <AlertTriangleIcon size={20} />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[10px] md:text-[11px] font-bold text-red-500 uppercase tracking-widest font-mono">
                Unauthorized_Access_Block
              </span>
              <p class="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider leading-relaxed">
                Provide authorization key for system data destruction.
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3 md:gap-4">
            <div class="grid grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] border border-white/10 focus-within:border-red-600 transition-colors">
              <div class="border-r border-white/10 p-3 md:p-4 flex items-center text-[8px] md:text-[9px] tracking-[0.2em] opacity-40 font-bold uppercase font-mono bg-white/2">
                SECRET
              </div>
              <input
                type="password"
                placeholder="/// **********"
                value={props.clearPassword}
                onInput={(e) => props.onSetClearPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onConfirmClearData()}
                aria-label="Confirm password for data deletion"
                autofocus
                class="w-full bg-transparent p-3 md:p-4 outline-none text-sm tracking-[0.5em] placeholder:opacity-20 font-mono text-[#EAEAEA]"
              />
            </div>
            
            <div class="flex flex-col sm:flex-row items-stretch gap-3 md:gap-4">
              <button
                class="flex-1 py-3 md:py-4 bg-red-600 hover:bg-red-700 text-white font-black text-[12px] md:text-[13px] uppercase tracking-[0.2em] font-mono transition-all disabled:opacity-20"
                disabled={!props.clearPassword}
                onClick={() => props.onConfirmClearData()}
              >
                Destroy_Data
              </button>
              <button
                class="px-6 md:px-10 py-3 md:py-4 bg-white/5 hover:bg-white/10 text-[#EAEAEA] border border-white/10 font-bold text-[12px] md:text-[13px] uppercase tracking-[0.2em] font-mono transition-all"
                onClick={() => props.onCancelClear()}
              >
                Abort
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
