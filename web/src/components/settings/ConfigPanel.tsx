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
    <div class="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-300">
      {/* SECTION: CONNECTIVITY */}
      <div class="border-b border-white/10">
        <div class="px-4 md:px-6 py-2 md:py-3 bg-white/2 border-b border-white/10 flex items-center justify-between">
          <h3 class="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <WifiIcon size={12} stroke-width={2.5} />
            LNK_INTERFACE
          </h3>
          <span class="text-[8px] md:text-[9px] text-zinc-600 font-mono tracking-widest uppercase">ID // WA_V4</span>
        </div>

        <div class="p-4 md:p-8">
          <div class={`mb-4 md:mb-6 flex flex-col gap-3 md:gap-4 border ${isConnected() ? "border-emerald-500/20 bg-emerald-500/2" : "border-red-600/20 bg-red-600/2"}`}>
            <div class="p-3 md:p-4 border-b border-inherit flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class={`w-1.5 md:w-2 h-1.5 md:h-2 ${isConnected() ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red-600 shadow-[0_0_8px_rgba(230,25,25,0.4)] animate-pulse"}`} />
                <span class={`text-[10px] md:text-[11px] font-bold uppercase tracking-[0.2em] font-mono ${isConnected() ? "text-emerald-500" : "text-red-500"}`}>
                  {isConnected() ? "SESSION_ESTABLISHED" : "LINK_TERMINATED"}
                </span>
              </div>
              <span class="text-[7px] md:text-[8px] opacity-40 font-mono">ID: {props.stats?.id || "0xNULL"}</span>
            </div>

            <Show when={!isConnected()}>
              <div class="p-4 md:p-6 flex flex-col items-center gap-4 md:gap-6">
                <Show when={props.pairing?.type === "qr"}>
                  <div class="flex flex-col items-center gap-4 text-center">
                    <div class="p-2 bg-white/90 brightness-110 contrast-125">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(props.pairing?.data || "")}&size=200x200`}
                        alt="Scan to pair"
                        class="w-32 h-32 md:w-44 md:h-44 mix-blend-multiply"
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <p class="text-[9px] md:text-[10px] text-[#EAEAEA] font-mono tracking-[0.2em] uppercase font-bold">
                        [ SECURITY_QR_AUTH_REQ ]
                      </p>
                      <p class="text-[8px] md:text-[9px] text-zinc-500 font-mono uppercase">Scan via mobile device</p>
                    </div>
                  </div>
                </Show>

                <Show when={props.pairing?.type === "code"}>
                  <div class="flex flex-col items-center gap-4 text-center w-full">
                    <div class="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest border border-white/10 px-3 md:px-4 py-1 bg-black">
                      PAIRING_SECRET
                    </div>
                    <div class="text-3xl md:text-4xl font-black text-red-600 drop-shadow-[0_0_15px_rgba(230,25,25,0.2)] tracking-[0.3em] font-mono py-1 md:py-2">
                      {props.pairing?.data || "INIT..."}
                    </div>
                    <p class="text-[9px] md:text-[10px] text-zinc-500 uppercase font-mono tracking-wider">
                      Input sequence on primary OS
                    </p>
                  </div>
                </Show>

                <Show when={!props.pairing?.data}>
                  <div class="flex flex-col items-center gap-3 py-4 md:py-8">
                    <Show
                      when={props.busy === "reset_wa" || props.isWaitingForPairing}
                      fallback={
                        <div class="text-[9px] md:text-[10px] font-mono text-zinc-600 text-center uppercase tracking-[0.2em]">
                          // STANDBY: Waiting for trigger...
                        </div>
                      }
                    >
                      <div class="flex gap-2">
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse" />
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse [animation-delay:0.2s]" />
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-red-600 animate-pulse [animation-delay:0.4s]" />
                      </div>
                      <span class="text-[9px] md:text-[10px] font-mono text-zinc-300 uppercase tracking-[0.3em] animate-pulse">
                        INIT_PROTOCOL...
                      </span>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            <div class="p-3 md:p-4 bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-3 md:gap-4 border-t border-inherit">
              <Show when={props.showResetNotice}>
                <div class="w-full sm:w-auto flex items-center gap-2 text-orange-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest bg-orange-500/5 px-2 md:px-3 py-1.5 md:py-2 border border-orange-500/20 font-mono">
                  <AlertTriangleIcon size={12} />
                  RESET_REQ
                </div>
              </Show>
              <button
                class="w-full sm:w-auto px-6 md:px-8 py-2 md:py-3 font-black text-[11px] md:text-[12px] uppercase tracking-[0.3em] font-mono transition-all active:scale-[0.98] disabled:opacity-20 relative group/btn overflow-hidden"
                classList={{
                  "bg-orange-600 text-white": props.showResetNotice,
                  "bg-white/5 text-[#EAEAEA] border border-white/10 hover:bg-white/10": !props.showResetNotice && isConnected(),
                  "bg-[#EAEAEA] text-black hover:bg-red-600 hover:text-white": !props.showResetNotice && !isConnected(),
                }}
                onClick={() => props.onReset()}
                disabled={!!props.busy}
              >
                <div class="relative z-10 text-[10px] md:text-[12px]">
                  {isConnected()
                    ? props.showResetNotice
                      ? "Apply_&_Reset"
                      : "Term_Session"
                    : "Init_Link"}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: PREFERENCES */}
      <div class="border-b border-white/10">
        <div class="px-4 md:px-6 py-2 md:py-3 bg-white/2 border-b border-white/10 flex items-center justify-between">
          <h3 class="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <SettingsIcon size={12} stroke-width={2.5} />
            SYS_PARAMETERS
          </h3>
          <span class="text-[8px] md:text-[9px] text-zinc-600 font-mono tracking-widest uppercase">REG // CFG_01</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2">
          {/* Auth Mechanism */}
          <div class="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] border-b border-white/10">
            <div class="border-r border-white/10 p-4 md:p-6 flex items-center text-[8px] md:text-[9px] tracking-[0.2em] opacity-40 font-bold uppercase font-mono bg-white/1">
              Auth_Mode
            </div>
            <div class="flex">
              <button
                class="flex-1 p-3 md:p-6 text-[10px] md:text-[11px] font-bold transition-all uppercase tracking-[0.2em] font-mono border-r border-white/10"
                classList={{
                  "bg-white/10 text-red-500": (props.config?.whatsapp_pairing_method || "code") === "qr",
                  "text-zinc-600 hover:text-zinc-300": (props.config?.whatsapp_pairing_method || "code") !== "qr",
                }}
                onClick={() => props.onConfigUpdate("whatsapp_pairing_method", "qr")}
              >
                QR
              </button>
              <button
                class="flex-1 p-3 md:p-6 text-[10px] md:text-[11px] font-bold transition-all uppercase tracking-[0.2em] font-mono"
                classList={{
                  "bg-white/10 text-red-500": (props.config?.whatsapp_pairing_method || "code") === "code",
                  "text-zinc-600 hover:text-zinc-300": (props.config?.whatsapp_pairing_method || "code") !== "code",
                }}
                onClick={() => props.onConfigUpdate("whatsapp_pairing_method", "code")}
              >
                CODE
              </button>
            </div>
          </div>

          {/* Session Key (Phone) */}
          <div class="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] border-b border-white/10 md:border-l">
            <label
              for="whatsapp_phone"
              class="border-r border-white/10 p-4 md:p-6 flex items-center text-[8px] md:text-[9px] tracking-[0.2em] opacity-40 font-bold uppercase font-mono bg-white/1 cursor-pointer"
            >
              Session_Key
            </label>
            <div class="relative flex items-center">
              <input
                id="whatsapp_phone"
                type="text"
                placeholder="/// PHONE_NUM"
                value={props.config?.whatsapp_phone || ""}
                onBlur={(e) => props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)}
                disabled={!!props.savingConfig}
                class="w-full bg-transparent p-4 md:p-6 outline-none text-sm tracking-[0.2em] placeholder:opacity-20 font-mono text-[#EAEAEA]"
              />
              <Show when={props.savingConfig === "whatsapp_phone"}>
                <div class="absolute right-4 md:right-6 w-2 h-2 bg-red-600 animate-pulse" />
              </Show>
            </div>
          </div>
        </div>

        <div 
          class="grid grid-cols-[1fr_80px] hover:bg-white/2 transition-all duration-300 border-t border-white/5"
          classList={{ "bg-red-600/[0.03] border-red-600/10": (props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) }}
        >
          <div class="p-4 md:p-6 flex flex-col gap-0.5 border-r border-white/10">
            <div 
              class="text-[11px] md:text-[12px] font-bold uppercase tracking-widest font-mono transition-colors"
              classList={{ "text-red-500": (props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled), "text-[#EAEAEA]": !(props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) }}
            >
              Auto_Relay_Stream
            </div>
            <div class="text-[8px] md:text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
              [ PROTOCOL: GCM_ENCRYPTED_STREAM ]
            </div>
          </div>
          <div class="flex items-center justify-center p-4">
            <label class="relative inline-flex flex-col items-center cursor-pointer group/toggle gap-1.5">
              <input
                type="checkbox"
                checked={props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled}
                onChange={() => props.onToggleNotify()}
                class="sr-only peer"
              />
              <div class="w-10 md:w-11 h-5 md:h-5.5 border border-white/20 peer-focus:outline-none flex p-0.5 transition-all duration-300 peer-checked:border-red-600 peer-checked:bg-red-600/10 bg-black/60 shadow-inner">
                <div class="w-4 h-full bg-zinc-800 transition-all duration-300 peer-checked:bg-red-600 peer-checked:translate-x-[calc(100%+2px)] border border-white/5 peer-checked:border-red-400 group-active/toggle:scale-x-125 origin-left" />
              </div>
              <span class="text-[7px] font-mono font-bold tracking-[0.2em] transition-all duration-300" 
                classList={{ 
                  "text-red-500 animate-pulse scale-110": (props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled), 
                  "text-zinc-700 opacity-40": !(props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) 
                }}>
                {(props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) ? "LIVE" : "STBY"}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
