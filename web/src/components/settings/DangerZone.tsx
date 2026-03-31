import { Show } from "solid-js";
import { AlertTriangleIcon } from "../Icons";

interface DangerZoneProps {
  clearing: boolean;
  confirmClear: boolean;
  clearPassword: string;
  onClearData: () => void;
  onConfirmClearData: () => void;
  onSetClearPassword: (val: string) => void;
  onCancelClear: () => void;
}

export default function DangerZone(props: DangerZoneProps) {
  return (
    <div class="mt-12 p-6 border-t border-red-500/10 bg-red-500/2 rounded-b-2xl">
      <h3 class="text-[13px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2 mb-6">
        <AlertTriangleIcon size={14} stroke-width={2.5} />
        Destructive Operations
      </h3>

      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 rounded-2xl bg-black/40 border border-red-500/10 hover:border-red-500/20 transition-all duration-300">
        <div class="flex flex-col gap-1.5 max-w-100">
          <div class="text-[14px] font-bold text-zinc-100">
            Wipe All System Data
          </div>
          <div class="text-[12px] text-zinc-500 leading-relaxed">
            Permanent deletion of all message logs, media files, and chat
            history. This action is irreversible and requires your
            administrative password.
          </div>
        </div>
        <button
          class="w-full sm:w-auto px-6 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-bold text-[13px] uppercase tracking-wider transition-all active:scale-95 border border-red-500/20 disabled:opacity-50 shadow-lg shadow-red-500/5 group"
          disabled={props.clearing}
          onClick={() => props.onClearData()}
        >
          {props.clearing ? "Execution In Progress..." : "Execute Wipe"}
        </button>
      </div>

      <Show when={props.confirmClear}>
        <div class="mt-4 p-6 rounded-2xl bg-zinc-900 border border-red-500/30 animate-in fade-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div class="flex items-center gap-3 mb-4 text-red-400">
            <AlertTriangleIcon size={20} />
            <span class="text-[14px] font-bold uppercase tracking-wide">
              Identity Verification Required
            </span>
          </div>
          <p class="text-[13px] text-zinc-400 mb-6 leading-relaxed">
            You are about to permanently delete all data. Please enter your
            system password to authorize this operation.
          </p>

          <div class="flex flex-col gap-4">
            <input
              type="password"
              placeholder="System Administrator Password"
              value={props.clearPassword}
              onInput={(e) => props.onSetClearPassword(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && props.onConfirmClearData()}
              aria-label="Confirm password for data deletion"
              autofocus
              class="w-full p-3 px-4 bg-black/40 border border-red-500/20 rounded-xl text-zinc-100 font-mono text-[14px] outline-none transition-all focus:border-red-500/50 focus:bg-red-500/5"
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
