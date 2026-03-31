import { createSignal, Show } from "solid-js";
import { login } from "./api";
import { setAuthenticated } from "./store";
import { LockIcon, ShieldIcon } from "./components/Icons";
import { notify } from "./notify";

export default function Login() {
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);

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
    <div class="flex items-center justify-center min-h-dvh relative overflow-hidden bg-black selection:bg-accent/30">
      {/* Immersive background elements */}
      <div 
        class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05)_0%,transparent_50%)] z-0" 
        aria-hidden="true" 
      />
      <div 
        class="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-size-[40px_40px] mask-[radial-gradient(ellipse_at_center,black,transparent_80%)] z-0" 
        aria-hidden="true" 
      />

      <div class="relative z-10 w-full max-w-105 p-6 animate-reveal">
        <div class="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-4xl overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.03)] transition-all duration-500 hover:border-white/10 group">
          <div class="p-10 pt-12 text-center text-zinc-100">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/5 border border-accent/10 mb-8 relative group-hover:scale-110 transition-transform duration-500">
              <ShieldIcon size={28} class="text-accent" />
              <div class="absolute -inset-2 border border-accent/20 rounded-2xl animate-logo-pulse pointer-events-none" />
            </div>

            <h1 class="text-2xl font-bold mb-2 font-outfit uppercase tracking-[0.2em]">
              Security Node
            </h1>
            <p class="text-zinc-500 text-[12px] uppercase tracking-widest font-mono mb-10 opacity-60">
              System Identifier: MONITOR-TS-01
            </p>

            <form onSubmit={handleSubmit} class="space-y-6">
              <div class="relative group/input">
                <div class="absolute inset-y-0 left-4 flex items-center text-zinc-500 group-focus-within/input:text-accent transition-colors">
                  <LockIcon size={16} />
                </div>
                <input
                  type="password"
                  placeholder="AUTHORIZATION KEY"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  required
                  autofocus
                  class="w-full bg-black/40 border border-white/5 py-4 pl-12 pr-4 rounded-xl text-center font-mono text-sm tracking-[0.5em] outline-none transition-all focus:border-accent/40 focus:bg-accent/5 focus:shadow-[0_0_30px_rgba(16,185,129,0.05)]"
                />
              </div>

              <button
                type="submit"
                disabled={loading()}
                class="w-full py-4 bg-zinc-100 hover:bg-white text-black font-bold text-[12px] uppercase tracking-[0.3em] rounded-xl transition-all duration-300 active:scale-95 disabled:opacity-30 flex items-center justify-center min-h-13"
              >
                <Show when={!loading()} fallback={
                  <div class="flex gap-1.5">
                    <div class="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                    <div class="w-1.5 h-1.5 rounded-full bg-black animate-pulse [animation-delay:0.2s]" />
                    <div class="w-1.5 h-1.5 rounded-full bg-black animate-pulse [animation-delay:0.4s]" />
                  </div>
                }>
                  Authorize Access
                </Show>
              </button>
            </form>
          </div>

          <div class="px-8 py-5 bg-white/2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
            <span>Status: Idle</span>
            <span>Uptime: 24.8d</span>
          </div>
        </div>

        <div class="mt-8 text-center text-zinc-700 text-[10px] uppercase tracking-[0.3em] font-medium">
          <span class="inline-block animate-pulse">Encrypted Session Secure</span>
        </div>
      </div>
    </div>
  );
}
