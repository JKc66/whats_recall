import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { login, fetchUptime } from "./api";
import { setAuthenticated } from "./store";
import { notify } from "./notify";
import { EyeIcon, MoonIcon, SunIcon } from "./components/Icons";
import { theme, setTheme } from "./store";

export default function Login() {
  const [username, setUsername] = createSignal("whatsapp-monitor");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [showPassword, setShowPassword] = createSignal(false);
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
  
  function toggleTheme() {
    setTheme(theme() === "dark" ? "light" : "dark");
  }

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
      notify.success("Access Granted", "Session established.");
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
    <div class="flex flex-col items-center justify-center min-h-dvh w-full bg-bg text-text-primary selection:bg-accent/30 overflow-hidden relative p-6">
      <div 
        class="relative z-10 w-full card bg-surface p-0 animate-entrance"
        style={{"max-width":"480px"}}
      >
        {/* Top Header Bar */}
        <div class="border-b border-border px-6 py-4 flex items-center justify-between text-label bg-surface-raised/50">
          <div class="flex items-center gap-3">
            <span class="text-success">● ONLINE</span>
            <span class="opacity-50">ARCHIVE</span>
          </div>
          <button
            class="flex items-center justify-center w-8 h-8 rounded-full text-text-secondary hover:bg-border-visible hover:text-text-primary transition-all active:tick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
            onClick={toggleTheme}
            title={theme() === "dark" ? "Light Mode" : "Dark Mode"}
            aria-label={theme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <Show when={theme() === "dark"} fallback={<MoonIcon size={16} />}>
              <SunIcon size={16} />
            </Show>
          </button>
        </div>

        {/* Hero Section */}
        <div class="px-8 py-12 border-b border-border">
          <h1 class="text-display text-[48px] uppercase mb-2">
            SIGN<br/>IN
          </h1>
          <div class="flex items-center gap-4 text-metadata opacity-40">
            <span>Secure Access</span>
            <div class="h-px grow bg-border" />
          </div>
        </div>

        <form onSubmit={handleSubmit} class="p-0">
          {/* Identity Field */}
          <div class="grid grid-cols-[120px_1fr] border-b border-border group focus-within:bg-border/5 transition-colors">
            <label 
              for="username-field"
              class="border-r border-border p-6 flex items-center text-label font-bold cursor-pointer"
            >
              USERNAME
            </label>
            <input
              id="username-field"
              type="text"
              name="username"
              autocomplete="username"
              placeholder="USER_ID"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              class="w-full bg-transparent p-6 outline-none text-[13px] font-mono tracking-[0.2em] uppercase placeholder:opacity-20 text-text-primary"
            />
          </div>

          {/* Access Key Field */}
          <div class="grid grid-cols-[120px_1fr] border-b border-border group focus-within:bg-border/5 transition-colors relative">
            <label 
              for="password-field"
              class="border-r border-border p-6 flex items-center text-label font-bold cursor-pointer"
            >
              PASSWORD
            </label>
            <div class="relative flex items-center grow">
              <input
                id="password-field"
                type={showPassword() ? "text" : "password"}
                name="password"
                autocomplete="current-password"
                placeholder="**********"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
                autofocus
                class="w-full bg-transparent p-6 outline-none text-[13px] font-mono tracking-[0.4em] placeholder:opacity-20 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword())}
                class="absolute right-4 p-2 text-text-disabled hover:text-text-primary transition-colors cursor-pointer"
                aria-label={showPassword() ? "Hide password" : "Show password"}
              >
                <EyeIcon size={16} />
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div class="p-8">
            <button
              type="submit"
              disabled={loading()}
              class="w-full py-5 bg-text-primary text-black hover:bg-success hover:text-black font-bold text-[14px] uppercase tracking-[0.4em] transition-all duration-200 rounded-full active:tick disabled:opacity-20"
            >
              <Show when={!loading()} fallback={"AUTHENTICATING..."}>
                SIGN IN
              </Show>
            </button>
          </div>
        </form>

        {/* Footer Meta Data */}
        <div class="border-t border-border grid grid-cols-2 bg-surface-raised/30">
          <div class="border-r border-border p-5 flex flex-col gap-1">
            <span class="text-metadata uppercase opacity-40">STATUS</span>
            <div class="flex items-center gap-2">
               <div class="w-1.5 h-1.5 bg-success" />
              <span class="text-label text-text-primary">ACTIVE</span>
            </div>
          </div>
          <div class="p-5 flex flex-col gap-1">
            <span class="text-metadata uppercase opacity-40">UPTIME</span>
            <span class="text-label text-text-primary">{formatUptime(uptimeSeconds())}</span>
          </div>
        </div>

        {/* Bottom Decorative Bar */}
        <div class="border-t border-border p-4 text-metadata opacity-40 text-center uppercase tracking-widest">
          SECURE_ACCESS
        </div>
      </div>
    </div>

  );
}
