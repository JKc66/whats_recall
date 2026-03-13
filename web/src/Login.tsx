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
      <div class="login-card">
        <div class="logo">🛡️</div>
        <h1>Message Monitor</h1>
        <p>Enter your password to access the dashboard</p>
        <form onSubmit={handleSubmit}>
          <div class="field">
            <input
              type="password"
              placeholder="Password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="current-password"
              required
              autofocus
            />
          </div>
          <button type="submit" disabled={loading()}>
            {loading() ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div class="login-error">{error()}</div>
      </div>
    </div>
  );
}
