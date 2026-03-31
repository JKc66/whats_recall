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
    <div class="flex flex-col gap-8 p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section class="space-y-4">
        <h3 class="text-[13px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
          <WifiIcon size={14} stroke-width={2.5} />
          Connectivity Status
        </h3>

        <div
          class={`p-5 rounded-2xl border transition-all duration-300 ${isConnected() ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}
        >
          <div class="flex items-center gap-2 mb-4">
            <span
              class={`w-2 h-2 rounded-full animate-pulse ${isConnected() ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span
              class={`text-[12px] font-bold uppercase tracking-wider ${isConnected() ? "text-emerald-500" : "text-red-500"}`}
            >
              {isConnected() ? "Authenticated & Active" : "Disconnected"}
            </span>
          </div>

          <Show when={!isConnected()}>
            <div class="bg-black/40 rounded-xl p-6 border border-white/5 flex flex-col items-center gap-6 shadow-inner mb-6">
              <Show when={props.pairing?.type === "qr"}>
                <div class="flex flex-col items-center gap-4 text-center">
                  <div class="p-4 bg-white rounded-xl shadow-[0_0_50px_rgba(255,255,255,0.05)] border border-white/10">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(props.pairing?.data || "")}&size=200x200`}
                      alt="Scan to pair"
                      class="w-50 h-50"
                    />
                  </div>
                  <p class="text-[14px] text-zinc-100 font-medium">
                    Scan this QR code with WhatsApp on your phone
                  </p>
                </div>
              </Show>

              <Show when={props.pairing?.type === "code"}>
                <div class="flex flex-col items-center gap-4 text-center w-full">
                  <div class="text-[11px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full border border-white/5">
                    Auth Code
                  </div>
                  <div class="text-4xl font-black text-accent drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] tracking-[0.2em] font-mono py-2">
                    {props.pairing?.data || "GENERATING"}
                  </div>
                  <p class="text-[13px] text-zinc-400 leading-relaxed max-w-70">
                    Enter this code in WhatsApp (Link a device → Link with phone
                    number)
                  </p>
                </div>
              </Show>

              <Show when={!props.pairing?.data}>
                <div class="flex flex-col items-center gap-3 py-8 opacity-60">
                  <Show
                    when={
                      props.busy === "reset_wa" || props.isWaitingForPairing
                    }
                    fallback={
                      <div class="text-[14px] font-medium text-zinc-500 text-center px-4">
                        Click "Initialize Link" below to begin the connection
                        process.
                      </div>
                    }
                  >
                    <div class="flex gap-1.5 mb-3">
                      <div class="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      <div class="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:0.2s]" />
                      <div class="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:0.4s]" />
                    </div>
                    <span class="text-[14px] font-medium text-zinc-300">
                      Generating pairing credentials...
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Show when={props.showResetNotice}>
              <div class="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wide bg-orange-400/10 px-3 py-2 rounded-lg border border-orange-400/20">
                <AlertTriangleIcon size={14} />
                Changes pending application
              </div>
            </Show>
            <button
              class="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-[13px] uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
              classList={{
                "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20":
                  props.showResetNotice,
                "bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10":
                  !props.showResetNotice && isConnected(),
                "bg-accent hover:bg-accent-bright text-white shadow-lg shadow-accent/20":
                  !props.showResetNotice && !isConnected(),
              }}
              onClick={() => props.onReset()}
              disabled={!!props.busy}
            >
              {isConnected()
                ? props.showResetNotice
                  ? "Apply & Reset Session"
                  : "Terminate Session"
                : "Initialize Link"}
            </button>
          </div>
        </div>
      </section>

      <section class="space-y-6">
        <h3 class="text-[13px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4 pt-4 border-t border-white/5">
          <SettingsIcon size={14} stroke-width={2.5} />
          Session Preferences
        </h3>

        <div class="space-y-6">
          <div class="flex flex-col gap-3">
            <label class="text-[14px] font-bold text-zinc-200">
              Pairing Mechanism
            </label>
            <div class="flex bg-black/40 p-1.5 rounded-xl border border-white/10 w-fit">
              <button
                class="px-5 py-2 text-[12px] font-bold rounded-lg transition-all"
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
                class="px-5 py-2 text-[12px] font-bold rounded-lg transition-all"
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

          <div class="flex flex-col gap-3 group">
            <label
              for="whatsapp_phone"
              class="text-[14px] font-bold text-zinc-200"
            >
              Session Phone Number
            </label>
            <div class="relative flex items-center max-w-[320px]">
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
                class="w-full p-3 px-4 bg-black/30 border border-white/10 rounded-xl text-zinc-100 font-mono text-[14px] outline-none transition-all focus:border-accent focus:bg-accent/5"
              />
              <Show when={props.savingConfig === "whatsapp_phone"}>
                <div class="absolute right-3 w-2 h-2 bg-accent rounded-full animate-pulse" />
              </Show>
            </div>
            <p class="text-[11px] text-zinc-500 leading-relaxed max-w-[320px]">
              Changing the phone number will invalidate the current session
              tokens and require re-authentication.
            </p>
          </div>

          <div class="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/[0.07] transition-colors">
            <div class="flex flex-col gap-1">
              <div class="text-[14px] font-bold text-zinc-200">
                Deletions Monitoring
              </div>
              <div class="text-[12px] text-zinc-500">
                Auto-forward deleted messages to your own number
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
              <div class="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-zinc-400 peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent transition-all animate-none" />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
