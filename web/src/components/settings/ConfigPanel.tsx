import { Show, createSignal } from "solid-js";
import { AlertTriangleIcon, SettingsIcon, EyeIcon } from "../Icons";
import RelayPreview from "./RelayPreview";

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
  const [showRelayPreview, setShowRelayPreview] = createSignal(false);
  const hasSession = () => props.stats?.authenticated || props.pairing?.authenticated;
  const isOnline = () => props.stats?.connected;

  return (
    <div class="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-300">
      {/* SECTION: CONNECTIVITY */}
      <div class="border-b border-border">
        <div class="px-4 md:px-6 py-2 md:py-3 bg-surface-raised/30 border-b border-border flex items-center justify-between">
          <h3 class="text-[9px] md:text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2">
            <div class="w-1.5 h-1.5 bg-accent rounded-full " />
            CONNECTION
          </h3>
        </div>

        <div class="p-3 md:p-8">
          <div class={`mb-4 md:mb-6 flex flex-col gap-3 md:gap-4 border ${isOnline() ? "border-success/30 bg-success/5" : "border-accent/30 bg-accent/5"}`}>
            <div class="p-3 md:p-4 border-b border-inherit flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class={`w-1.5 md:w-2 h-1.5 md:h-2 ${isOnline() ? "bg-success" : "bg-accent"}`} />
                <span class={`text-[10px] md:text-[11px] font-bold uppercase tracking-[0.2em] font-mono ${isOnline() ? "text-success" : "text-accent"}`}>
                  {isOnline() ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <span class="text-[7px] md:text-[8px] text-text-disabled font-mono uppercase">ID: {props.stats?.myId || "--"}</span>
            </div>

            <Show when={!hasSession()}>
              <div class="p-4 md:p-6 flex flex-col items-center gap-4 md:gap-6">
                <Show when={props.pairing?.type === "qr"}>
                  <div class="flex flex-col items-center gap-4 text-center">
                    <div class="p-2 bg-white ring-8 ring-white/5 ">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(props.pairing?.data || "")}&size=200x200`}
                        alt="Scan to pair"
                        class="w-32 h-32 md:w-44 md:h-44 mix-blend-multiply transition-opacity duration-500"
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <p class="text-[9px] md:text-[10px] text-text-primary font-mono tracking-[0.2em] uppercase font-bold">
                        SCAN_QR
                      </p>
                      <p class="text-[8px] md:text-[9px] text-text-secondary font-mono uppercase">Use your mobile device</p>
                    </div>
                  </div>
                </Show>

                <Show when={props.pairing?.type === "code"}>
                  <div class="flex flex-col items-center gap-4 text-center w-full">
                    <div class="text-[9px] md:text-[10px] font-bold text-text-secondary uppercase tracking-widest border border-border px-3 md:px-4 py-1 bg-surface-raised">
                      PAIRING_CODE
                    </div>
                    <div class="text-3xl md:text-4xl font-bold text-accent tracking-[0.3em] font-mono py-1 md:py-2">
                      {props.pairing?.data || "INIT..."}
                    </div>
                    <p class="text-[9px] md:text-[10px] text-text-secondary uppercase font-mono tracking-wider">
                      ENTER ON MOBILE DEVICE
                    </p>
                  </div>
                </Show>

                <Show when={!props.pairing?.data}>
                  <div class="flex flex-col items-center gap-3 py-4 md:py-8">
                    <Show
                      when={props.busy === "reset_wa" || props.isWaitingForPairing}
                      fallback={
                        <div class="text-[9px] md:text-[10px] font-mono text-text-disabled text-center uppercase tracking-[0.2em]">
                          WAITING_FOR_PAIRING...
                        </div>
                      }
                    >
                      <div class="flex gap-2">
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse" />
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse [animation-delay:0.2s]" />
                        <div class="w-1 md:w-1.5 h-1 md:h-1.5 bg-accent animate-pulse [animation-delay:0.4s]" />
                      </div>
                      <span class="text-[9px] md:text-[10px] font-mono text-accent uppercase tracking-[0.3em] animate-pulse">
                        CONNECTING...
                      </span>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            <div class="p-4 md:p-6 bg-surface-raised/50 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-inherit">
              <Show when={props.showResetNotice}>
                <div class="w-full sm:w-auto flex items-center gap-2 text-warning text-label bg-warning/10 px-3 py-2 border border-warning/30">
                  <AlertTriangleIcon size={12} />
                  RESET_SESSION
                </div>
              </Show>
              <button
                class="btn w-full sm:w-auto min-w-40"
                classList={{
                  "btn-primary bg-warning text-black border-warning": props.showResetNotice,
                  "btn-secondary": !props.showResetNotice && hasSession(),
                  "btn-primary": !props.showResetNotice && !hasSession(),
                }}
                onClick={() => props.onReset()}
                disabled={!!props.busy}
              >
                {hasSession()
                  ? props.showResetNotice
                  ? "APPLY_CHANGES"
                    : "DISCONNECT"
                  : "CONNECT"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: PREFERENCES */}
      <div class="border-b border-border">
        <div class="px-4 md:px-6 py-2 md:py-3 bg-surface-raised/30 border-b border-border flex items-center justify-between">
          <h3 class="text-[9px] md:text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2">
            <SettingsIcon size={12} stroke-width={2.5} />
            SETTINGS
          </h3>
          <span class="text-[8px] md:text-[9px] text-text-disabled font-mono tracking-widest uppercase">CONFIGURATION</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2">
          {/* Auth Mechanism */}
          <div class="grid grid-cols-[90px_1fr] md:grid-cols-[140px_1fr] border-b border-border">
            <div class="border-r border-border p-3 md:p-6 flex items-center text-label bg-surface-raised/20">
              METHOD
            </div>
            <div class="flex items-center px-4">
              <div class="segmented-control w-full">
                <button
                  class="segmented-item"
                  classList={{ 
                    "active": (props.config?.whatsapp_pairing_method || "code") === "qr"
                  }}
                  onClick={() => props.onConfigUpdate("whatsapp_pairing_method", "qr")}
                >
                  {(props.config?.whatsapp_pairing_method || "code") === "qr" ? "[ QR ]" : "QR"}
                </button>
                <button
                  class="segmented-item"
                  classList={{ 
                    "active": (props.config?.whatsapp_pairing_method || "code") === "code"
                  }}
                  onClick={() => props.onConfigUpdate("whatsapp_pairing_method", "code")}
                >
                  {(props.config?.whatsapp_pairing_method || "code") === "code" ? "[ CODE ]" : "CODE"}
                </button>
              </div>
            </div>
          </div>

          {/* Session Key (Phone) */}
          <div class="grid grid-cols-[90px_1fr] md:grid-cols-[140px_1fr] border-b border-border md:border-l">
            <label
              for="whatsapp_phone"
              class="border-r border-border p-3 md:p-6 flex items-center text-label bg-surface-raised/20 cursor-pointer"
            >
              PHONE_NUM
            </label>
            <div class="relative flex items-center bg-surface">
              <input
                id="whatsapp_phone"
                type="text"
                placeholder="PHONE_NUM_ENTRY"
                value={props.config?.whatsapp_phone || ""}
                onBlur={(e) => props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && props.onConfigUpdate("whatsapp_phone", e.currentTarget.value)}
                disabled={!!props.savingConfig}
                class="w-full bg-transparent p-4 md:p-6 outline-none text-sm tracking-[0.2em] placeholder:text-text-disabled/30 font-mono text-text-primary"
              />
              <Show when={props.savingConfig === "whatsapp_phone"}>
                <div class="absolute right-4 md:right-6 w-2 h-2 bg-accent animate-pulse" />
              </Show>
            </div>
          </div>
        </div>

        <div 
          class="flex flex-col border-t border-border transition-all duration-500"
          classList={{ "bg-accent/[0.03]": (props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) }}
        >
          <div class="grid grid-cols-[1fr_80px]">
            <div class="p-4 md:p-6 flex flex-col gap-1 border-r border-border">
              <div 
                class="text-[11px] md:text-[12px] font-bold uppercase tracking-widest font-mono transition-colors"
                classList={{ "text-accent": (props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled), "text-text-primary": !(props.config ? props.config?.whatsapp_notify === "true" : props.stats.notifyEnabled) }}
              >
                MESSAGE_RELAY
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <div class="text-[8px] md:text-[9px] text-text-secondary uppercase tracking-widest font-mono">
                    FORWARD_DELETED_CONTENT_TO_SELF
                </div>
                <button 
                    onClick={() => setShowRelayPreview(!showRelayPreview())} 
                    class="tag border-dashed hover:border-accent hover:text-accent transition-all cursor-pointer h-5 px-2 text-[7px]"
                    classList={{ "tag-accent border-solid bg-accent/10": showRelayPreview() }}
                >
                    <div class="flex items-center gap-1.5 font-bold">
                        <EyeIcon size={10} />
                        {showRelayPreview() ? "HIDE_PREVIEW" : "PREVIEW_FLOW"}
                    </div>
                </button>
              </div>
            </div>
            <div class="flex items-center justify-center p-4">
                <label class="relative inline-flex flex-col items-center cursor-pointer group/toggle gap-1.5 antialiased">
                <input
                    type="checkbox"
                    checked={props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled}
                    onChange={() => props.onToggleNotify()}
                    class="sr-only peer"
                />
                <div 
                    class={`w-12 h-6 border transition-all duration-300 rounded-full relative p-1 flex items-center ${
                    (props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled) ? "bg-text-display border-text-display" : "bg-surface border-border-visible"
                    }`}
                >
                    <div 
                    class="h-4 w-4 rounded-full transition-all duration-300"
                    style={{
                        "background-color": (props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled) ? "var(--black)" : "var(--text-disabled)",
                        "transform": (props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled) ? "translateX(24px)" : "translateX(0)"
                    }}
                    />
                </div>
                <span class={`text-[7px] font-mono font-bold tracking-[0.2em] transition-all duration-300 ${
                    (props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled) ? "text-accent" : "text-text-disabled opacity-40"
                }`}>
                    {(props.config?.whatsapp_notify === "true" || props.stats.notifyEnabled) ? "ON" : "OFF"}
                </span>
                </label>
            </div>
          </div>
          
          <Show when={showRelayPreview()}>
            <div class="px-4 md:px-6 pb-6 md:pb-8 transition-all duration-500">
                <RelayPreview />
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
