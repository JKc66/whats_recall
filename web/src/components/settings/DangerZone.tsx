import { Show } from "solid-js";
import { AlertTriangleIcon } from "../Icons";

interface DangerZoneProps {
  clearing: boolean;
  confirmClear: boolean;
  clearPassword: string;
  onClearData: () => void;
  onConfirmClearData: () => void;
  onSetClearPassword: ( _val: string) => void;
  onCancelClear: () => void;
}

export default function DangerZone(props: DangerZoneProps) {
  return (
    <div class="mt-8 p-4 md:p-6 border-t border-red-500/10 bg-red-500/2 rounded-b-2xl">
      <h3 class="text-[11px] font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
        <AlertTriangleIcon size={12} stroke-width={2.5} />
        Destructive
      </h3>

      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-red-500/10 hover:border-red-500/20 transition-all duration-300">
        <div class="flex flex-col gap-0.5 max-w-100">
          <div class="text-[13px] font-bold text-zinc-100 uppercase tracking-wide">
            Wipe System Data
          </div>
          <div class="text-[11px] text-zinc-500 leading-relaxed">
            Irreversible deletion of all logs, media, and history. 
            Requires admin password.
          </div>
        </div>
        <button
          class="w-full md:w-auto px-5 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all active:scale-95 border border-red-500/20 disabled:opacity-50"
          disabled={props.clearing}
          onClick={() => props.onClearData()}
        >
          {props.clearing ? "Executing Wipe..." : "Execute Wipe"}
        </button>
      </div>

      <Show when={props.confirmClear}>
        <div class="mt-3 p-4 rounded-xl bg-zinc-900 border border-red-500/30 animate-in fade-in zoom-in-95 duration-300 shadow-2xl">
          <div class="flex items-center gap-2 mb-3 text-red-400">
            <AlertTriangleIcon size={16} />
            <span class="text-[12px] font-bold uppercase tracking-wide">
              Identity Verification
            </span>
          </div>
          <p class="text-[12px] text-zinc-400 mb-4 leading-normal">
            Enter your system password to authorize permanent data destruction.
          </p>

          <div class="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Admin Password"
              value={props.clearPassword}
              onInput={(e) => props.onSetClearPassword(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && props.onConfirmClearData()}
              aria-label="Confirm password for data deletion"
              autofocus
              class="w-full p-2.5 px-4 bg-black/40 border border-red-500/20 rounded-lg text-zinc-100 font-mono text-[13px] outline-none transition-all focus:border-red-500/50 focus:bg-red-500/5"
            />
            <div class="flex items-center gap-3">
              <button
                class="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[13px] uppercase tracking-wider transition-all disabled:opacity-50"
                disabled={!props.clearPassword}
                onClick={() => props.onConfirmClearData()}
              >
                Permanently Destroy All Data
              </button>
              <button
                class="px-6 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl font-bold text-[13px] uppercase tracking-wider transition-all"
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
