import { createSignal, Show } from "solid-js";
import { login } from "./api";
import { setAuthenticated } from "./store";
import { MonitorIcon, LockIcon } from "./components/Icons";

export default function Login() {
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
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
    setError("");
    setLoading(true);
    try {
      const fp = await getFingerprint();
      await login(password(), fp);
      setAuthenticated(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed. Check your password and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="flex items-center justify-center min-h-dvh relative overflow-hidden bg-bg">
      <div
        class="absolute w-200 h-200 bg-[radial-gradient(circle,rgba(16,185,129,0.12)_0%,transparent_60%)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"
        aria-hidden="true"
      />
      <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-outfit text-[240px] font-black text-white/[0.012] pointer-events-none z-0 tracking-widest whitespace-nowrap"
        aria-hidden="true"
      >
        SECURED
      </div>

      <div class="relative z-10 bg-zinc-900/65 backdrop-blur-[48px] border border-white/4 rounded-[1.8rem] p-16 px-12 w-full max-w-110 shadow-[0_40px_80px_-20px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_40px_rgba(16,185,129,0.02)] text-center animate-login-enter">
        <div
          class="w-20 h-20 rounded-full bg-accent/3 border border-accent/15 flex items-center justify-center mx-auto mb-8 relative shadow-[0_0_30px_rgba(16,185,129,0.05)]"
          aria-hidden="true"
        >
          <MonitorIcon
            size={32}
            color="var(--color-accent)"
            stroke-width={1.5}
          />
          <div class="absolute -inset-3 border border-dashed border-accent/30 rounded-full animate-[spin_20s_linear_infinite] pointer-events-none" />
          <div class="absolute -inset-0.5 border border-accent/15 rounded-full animate-logo-pulse pointer-events-none" />
        </div>

        <div class="mb-10 text-center">
          <h1 class="text-[28px] font-medium tracking-tight mb-2 text-zinc-100 font-outfit">
            System Access
          </h1>
          <p class="text-text-3 text-[13px] leading-relaxed">
            End-to-end encrypted telemetry platform.
          </p>
        </div>

        <form onSubmit={handleSubmit} name="whatsapp-monitor-login">
          <input
            type="text"
            name="username"
            autocomplete="username"
            value="whatsapp-monitor"
            readOnly
            class="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
          <div class="relative mb-6">
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="Authentication Key"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="current-password webauthn"
              spellcheck={false}
              required
              autofocus
              class="w-full py-4.5 px-5 bg-black/20 border border-white/8 rounded-radius-lg text-zinc-100 font-inherit text-[15px] outline-none transition-[border-color,box-shadow,background] duration-200 text-center tracking-widest focus-visible:border-accent focus-visible:bg-accent/3 focus-visible:shadow-[0_0_0_2px_rgba(16,185,129,0.15)]"
            />
          </div>
          <button
            class="w-full p-4 bg-accent text-bg font-outfit text-sm font-semibold border-none rounded-radius-lg cursor-pointer transition-all duration-300 tracking-wide shadow-[0_8px_24px_rgba(16,185,129,0.2)] flex items-center justify-center hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-[0_12px_32px_rgba(16,185,129,0.3)] hover:not-disabled:bg-accent-bright active:not-disabled:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
            type="submit"
            disabled={loading()}
          >
            <Show
              when={!loading()}
              fallback={
                <div class="flex gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse" />
                  <div class="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse [animation-delay:0.2s]" />
                  <div class="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse [animation-delay:0.4s]" />
                </div>
              }
            >
              <span>Initialize Connection</span>
            </Show>
          </button>
        </form>

        <Show when={error()}>
          <div
            class="text-red-dim text-[13px] mt-4 bg-red-dim/8 border border-red-dim/15 p-2.5 rounded-lg animate-login-enter"
            aria-live="polite"
          >
            {error()}
          </div>
        </Show>

        <div class="mt-8 flex items-center justify-center gap-2 text-[11px] text-text-3 tracking-widest uppercase font-mono">
          <span class="opacity-70" aria-hidden="true">
            <LockIcon
              size={12}
              color="var(--color-text-3)"
              stroke-width={2.5}
            />
          </span>
          Zero-Knowledge Architecture
        </div>
      </div>
    </div>
  );
}
