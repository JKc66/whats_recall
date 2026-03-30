import { createSignal, Show } from 'solid-js';
import { login } from './api';
import { setAuthenticated } from './store';
import { MonitorIcon, LockIcon } from './components/Icons';

export default function Login() {
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  async function getFingerprint(): Promise<string> {
    try {
      const tm = await import('thumbmarkjs');
      return await tm.getFingerprint();
    } catch {
      return fallbackFingerprint();
    }
  }

  function fallbackFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fp', 2, 2);
    const raw = [
      navigator.userAgent, navigator.language,
      screen.width, screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(), canvas.toDataURL(),
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fp = await getFingerprint();
      await login(password(), fp);
      setAuthenticated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your password and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="login-page">
      <div class="ambient-glow" aria-hidden="true" />
      <div class="watermark-bg" aria-hidden="true">SECURED</div>
      
      <div class="login-card">
        <div class="login-logo" aria-hidden="true">
          <MonitorIcon size={32} color="var(--accent)" stroke-width={1.5} />
          <div class="logo-pulse"></div>
          <div class="logo-pulse-2"></div>
        </div>
        
        <div class="login-header">
          <h1>System Access</h1>
          <p>End-to-end encrypted telemetry platform.</p>
        </div>

        <form onSubmit={handleSubmit} name="whatsapp-monitor-login">
          <input
            type="text"
            name="username"
            autocomplete="username"
            value="whatsapp-monitor"
            readOnly
            style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', 'pointer-events': 'none' }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div class="login-field">
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
            />
            <div class="field-focus-bg"></div>
          </div>
          <button class="login-btn" type="submit" disabled={loading()}>
            <Show when={!loading()} fallback={<div class="spinner sm" />}>
              <span>Initialize Connection</span>
            </Show>
          </button>
        </form>

        <Show when={error()}>
          <div class="login-error" aria-live="polite">{error()}</div>
        </Show>

        <div class="login-footer">
          <span class="lock-icon" aria-hidden="true">
            <LockIcon size={12} color="var(--text-3)" stroke-width={2.5} />
          </span>
          Zero-Knowledge Architecture
        </div>
      </div>
    </div>
  );
}
