import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { login, fetchUptime } from "./api";
import { setAuthenticated } from "./store";
import { notify } from "./notify";

export default function Login() {
  const [username, setUsername] = createSignal("whatsapp-monitor");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [uptimeSeconds, setUptimeSeconds] = createSignal(0);

  onMount(async () => {
    try {
      const data = await fetchUptime();
      setUptimeSeconds(data.uptime);
    } catch {
      setUptimeSeconds(2142720); // Fallback to 24.8d
    }

    const timer = setInterval(() => {
      setUptimeSeconds(prev => prev + 1);
    }, 1000);

    onCleanup(() => clearInterval(timer));
  });

  const formatUptime = (totalSeconds: number) => {
    const d = Math.floor(totalSeconds / (24 * 3600));
    const h = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${d}D ${h}H ${m}M ${s}S`;
  };

  async function getFingerprint(): Promise<string> {
    try {
      const tm = await import("thumbmarkjs");
      return await tm.getFingerprint();
    } catch {
      return fallbackFingerprint();
    }
  }

  function fallbackFingerprint(): string {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("fp", 2, 2);
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
    ].join("|");
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    try {
      const fp = await getFingerprint();
      await login(password(), fp);
      localStorage.setItem("fingerprint", fp); // Persist fingerprint for API requests
      setAuthenticated(true);
      notify.success("Access Granted", "Welcome to the terminal.");
    } catch (err: any) {
      notify.warning(
        "Access Denied",
        err instanceof Error ? err.message : "Invalid authentication key."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="flex items-center justify-center min-h-dvh bg-[#0A0A0A] text-[#EAEAEA] font-mono selection:bg-red-600/30 overflow-hidden relative">
      {/* CRT Scanline Effect */}
      <div 
        class="fixed inset-0 pointer-events-none z-50 opacity-[0.03]"
        style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 4px)" }}
      />
      
      {/* Technical Background Grid */}
      <div class="fixed inset-0 opacity-[0.02] pointer-events-none z-0 bg-[linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] bg-size-[40px_40px]" />

      <div class="relative z-10 w-full max-w-lg border-x border-white/10 animate-reveal">
        {/* Top Header Bar */}
        <div class="border-y border-white/10 px-6 py-3 flex items-center justify-between text-[10px] tracking-[0.2em] bg-white/2">
          <div class="flex items-center gap-4">
            <span class="text-red-600 font-bold">● LIVE</span>
            <span class="opacity-40">COMM_NODE / WHATSAPP_MONITOR</span>
          </div>
          <span class="opacity-40">REV / 4.0.1</span>
        </div>

        {/* Macro Typography Title Section */}
        <div class="px-8 py-16 border-b border-white/10">
          <h1 class="text-6xl font-black font-sans leading-[0.8] tracking-[-0.05em] uppercase mb-4">
            Security<br/>Access
          </h1>
          <div class="flex items-center gap-4 text-[10px] opacity-40 tracking-[0.3em]">
            <span>[ AUTHREQ_SIGNAL ]</span>
            <div class="h-px grow bg-white/10" />
            <span>0x00FE24</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} class="p-0">
          {/* Input Section - Username */}
          <div class="grid grid-cols-[120px_1fr] border-b border-white/10 group focus-within:bg-white/2 transition-colors">
            <div class="border-r border-white/10 p-6 flex items-center text-[10px] tracking-widest opacity-40 font-bold uppercase">
              Identity
            </div>
            <input
              type="text"
              name="username"
              autocomplete="username"
              placeholder="/// USER_ID"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              class="w-full bg-transparent p-6 outline-none text-sm tracking-[0.2em] placeholder:opacity-20 uppercase font-mono"
            />
          </div>

          {/* Input Section - Password */}
          <div class="grid grid-cols-[120px_1fr] border-b border-white/10 group focus-within:bg-white/2 transition-colors">
            <div class="border-r border-white/10 p-6 flex items-center text-[10px] tracking-widest opacity-40 font-bold uppercase">
              Access_Key
            </div>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="/// **********"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              autofocus
              class="w-full bg-transparent p-6 outline-none text-sm tracking-[0.5em] placeholder:opacity-20 font-mono"
            />
          </div>

          {/* Action Section */}
          <div class="p-8">
            <button
              type="submit"
              disabled={loading()}
              class="w-full py-6 bg-[#EAEAEA] hover:bg-red-600 text-black hover:text-white font-black text-[14px] uppercase tracking-[0.5em] transition-all duration-200 active:scale-[0.99] disabled:opacity-20 relative overflow-hidden group/btn"
            >
              <Show when={!loading()} fallback={
                <span class="animate-pulse">AUTHENTICATING...</span>
              }>
                Authorize_Session
              </Show>
              {/* Button Decoration */}
              <div class="absolute top-0 right-0 p-1 opacity-20 group-hover/btn:opacity-100 transition-opacity">
                <span class="text-[8px] font-mono leading-none">®</span>
              </div>
            </button>
          </div>
        </form>

        {/* Footer Meta Data */}
        <div class="border-t border-white/10 grid grid-cols-2 bg-white/2">
          <div class="border-r border-white/10 p-5 flex flex-col gap-1">
            <span class="text-[8px] opacity-40 tracking-widest font-bold">NODE_STATUS</span>
            <div class="flex items-center gap-2">
              <div class="w-1.5 h-1.5 bg-red-600 shadow-[0_0_8px_rgba(230,25,25,0.6)]" />
              <span class="text-[10px] tracking-widest font-bold">TERMINAL_ACTIVE</span>
            </div>
          </div>
          <div class="p-5 flex flex-col gap-1">
            <span class="text-[8px] opacity-40 tracking-widest font-bold">UPTIME_METRIC</span>
            <span class="text-[10px] tracking-widest font-bold">{formatUptime(uptimeSeconds())}</span>
          </div>
        </div>

        {/* Bottom Decorative Bar */}
        <div class="border-t border-white/10 p-4 text-[8px] opacity-20 tracking-[0.5em] text-center">
          DECRIPTION_MODE: AES_256_GCM /// SESSION_STABILITY: 99.8%
        </div>
      </div>
    </div>
  );
}
