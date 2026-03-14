import { createSignal } from 'solid-js';
import { login } from './api';
import { setAuthenticated } from './store';

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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="login-page">
      <div class="bg-pattern" />
      <div class="login-card">
        <div class="login-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h1>Message Monitor</h1>
        <p>Secure access to your message monitoring dashboard</p>
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
              type="password"
              name="password"
              placeholder="Enter password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="current-password webauthn"
              required
              autofocus
            />
          </div>
          <button class="login-btn" type="submit" disabled={loading()}>
            {loading() ? 'Authenticating...' : 'Unlock Dashboard'}
          </button>
        </form>
        <div class="login-error">{error()}</div>
        <div class="login-footer">
          <span class="lock-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          End-to-end encrypted session
        </div>
      </div>
    </div>
  );
}
