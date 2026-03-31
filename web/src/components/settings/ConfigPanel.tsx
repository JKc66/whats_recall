import { Show } from "solid-js";
import { WifiIcon, AlertTriangleIcon, SettingsIcon } from "../Icons";

interface ConfigPanelProps {
  pairing: any;
  config: any;
  busy: string | null;
  savingConfig: string | null;
  showResetNotice: boolean;
  isWaitingForPairing: boolean;
  stats: any;
  onConfigUpdate: (_key: string, _value: string) => void;
  onReset: () => void;
  onToggleNotify: () => void;
}

export default function ConfigPanel(props: ConfigPanelProps) {
  const isConnected = () => props.stats?.authenticated || props.pairing?.authenticated;

  return (
    <div class="flex flex-col gap-4 p-4 md:p-6 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <section class="space-y-3">
        <h3 class="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
          <WifiIcon size={12} stroke-width={2.5} />
          Connectivity
        </h3>

        <div
          class={`p-4 border transition-all duration-300 ${isConnected() ? "bg-emerald-500/2 border-emerald-500/20" : "bg-red-600/5 border-red-600/20"}`}
        >
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <span
                class={`w-1.5 h-1.5 ${isConnected() ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red-600 shadow-[0_0_8px_rgba(230,25,25,0.4)] animate-pulse"}`}
              />
              <span
                class={`text-[10px] font-bold uppercase tracking-widest ${isConnected() ? "text-emerald-500" : "text-red-600"}`}
              >
                {isConnected() ? "SESSION_ACTIVE" : "DISCONNECTED"}
              </span>
            </div>
            <span class="text-[9px] text-zinc-600 font-mono">STATUS // WA_LIVE</span>
          </div>

          <Show when={!isConnected()}>
            <div class="bg-black/40 p-4 border border-white/5 flex flex-col items-center gap-4 shadow-inner mb-4">
              <Show when={props.pairing?.type === "qr"}>
                <div class="flex flex-col items-center gap-3 text-center">
                  <div class="p-2 bg-white shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(props.pairing?.data || "")}&size=200x200`}
                      alt="Scan to pair"
                      class="w-40 h-40"
                    />
                  </div>
                  <p class="text-[11px] text-zinc-100 font-mono tracking-tight uppercase opacity-70">
                    SCAN QR CODE
                  </p>
                </div>
              </Show>

              <Show when={props.pairing?.type === "code"}>
                <div class="flex flex-col items-center gap-2 text-center w-full">
                  <div class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 border border-white/5">
                    PAIRING CODE
                  </div>
                  <div class="text-3xl font-black text-red-600 drop-shadow-[0_0_15px_rgba(230,25,25,0.2)] tracking-[0.25em] font-mono py-1">
                    {props.pairing?.data || "INIT..."}
                  </div>
                  <p class="text-[11px] text-zinc-500 uppercase font-mono">
                    Enter code in WhatsApp Linked Devices
                  </p>
                </div>
              </Show>

              <Show when={!props.pairing?.data}>
                <div class="flex flex-col items-center gap-3 py-6 opacity-60">
                  <Show
                    when={
                      props.busy === "reset_wa" || props.isWaitingForPairing
                    }
                    fallback={
                      <div class="text-[11px] font-mono text-zinc-500 text-center uppercase tracking-wider">
                        Waiting for user to initialize...
                      </div>
                    }
                  >
                    <div class="flex gap-1.5 mb-2">
                      <div class="w-1.5 h-1.5 bg-red-600 animate-pulse" />
                      <div class="w-1.5 h-1.5 bg-red-600 animate-pulse [animation-delay:0.2s]" />
                      <div class="w-1.5 h-1.5 bg-red-600 animate-pulse [animation-delay:0.4s]" />
                    </div>
                    <span class="text-[11px] font-mono text-zinc-300 uppercase tracking-widest">
                      Initializing Session...
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
            <Show when={props.showResetNotice}>
              <div class="flex items-center gap-2 text-orange-500 text-[9px] font-bold uppercase tracking-widest bg-orange-500/5 px-2 py-1.5 border border-orange-500/20">
                <AlertTriangleIcon size={12} />
                SESSION_RESET_REQUIRED
              </div>
            </Show>
            <button
              class="w-full sm:w-auto px-5 py-2 font-black text-[11px] uppercase tracking-[0.15em] font-mono transition-all active:scale-95 disabled:opacity-50"
              classList={{
                "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/20":
                  props.showResetNotice,
                "bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10":
                  !props.showResetNotice && isConnected(),
                "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20":
                  !props.showResetNotice && !isConnected(),
              }}
              onClick={() => props.onReset()}
              disabled={!!props.busy}
            >
              {isConnected()
                ? props.showResetNotice
                  ? "[ APPLY & RESET ]"
                  : "[ TERMINATE SESSION ]"
                : "[ INITIALIZE LINK ]"}
            </button>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <h3 class="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2 pt-4 border-t border-white/5">
          <SettingsIcon size={12} stroke-width={2.5} />
          Preferences
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <div class="flex flex-col gap-2">
            <label class="text-[12px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">
              Auth Mechanism
            </label>
            <div class="flex bg-black/40 p-1 rounded-lg border border-white/10 w-fit">
              <button
                class="px-4 py-1.5 text-[11px] font-bold rounded-md transition-all uppercase tracking-wider"
                classList={{
                  "bg-zinc-800 text-white shadow-md":
                    (props.config?.whatsapp_pairing_method || "code") === "qr",
                  "text-zinc-500 hover:text-zinc-300":
                    (props.config?.whatsapp_pairing_method || "code") !== "qr",
                }}
                onClick={() =>
                  props.onConfigUpdate("whatsapp_pairing_method", "qr")
                }
              >
                QR Scan
              </button>
              <button
                class="px-4 py-1.5 text-[11px] font-bold rounded-md transition-all uppercase tracking-wider"
                classList={{
                  "bg-zinc-800 text-white shadow-md":
                    (props.config?.whatsapp_pairing_method || "code") ===
                    "code",
                  "text-zinc-500 hover:text-zinc-300":
                    (props.config?.whatsapp_pairing_method || "code") !==
                    "code",
                }}
                onClick={() =>
                  props.onConfigUpdate("whatsapp_pairing_method", "code")
                }
              >
                Pairing Code
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-2 group">
            <label
              for="whatsapp_phone"
              class="text-[12px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1"
            >
              Session Key (Phone)
            </label>
            <div class="relative flex items-center w-full max-w-[320px]">
              <input
                id="whatsapp_phone"
                type="text"
                placeholder="+12345678900"
                value={props.config?.whatsapp_phone || ""}
                onBlur={(e) =>
                  props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)
                }
                disabled={!!props.savingConfig}
                class="w-full p-2.5 px-4 bg-black/30 border border-white/10 rounded-lg text-zinc-100 font-mono text-[13px] outline-none transition-all focus:border-red-600/30 focus:bg-red-600/5 focus:shadow-[0_0_20px_rgba(230,25,25,0.03)]"
              />
              <Show when={props.savingConfig === "whatsapp_phone"}>
                <div class="absolute right-3 w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
              </Show>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between p-4 bg-white/2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors">
          <div class="flex flex-col gap-0.5">
            <div class="text-[12px] font-bold text-zinc-200 uppercase tracking-wide">
              Deletions Forwarder
            </div>
            <div class="text-[11px] text-zinc-500 opacity-60">
              Auto-forward recovered data to primary node
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={
                props.config
                  ? props.config?.whatsapp_notify === "true"
                  : props.stats.notifyEnabled
              }
              onChange={() => props.onToggleNotify()}
              class="sr-only peer"
            />
            <div class="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-px after:left-px after:bg-zinc-400 peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600 transition-all animate-none" />
          </label>
        </div>
      </section>
    </div>
  );
}
