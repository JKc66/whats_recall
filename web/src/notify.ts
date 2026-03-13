type NotifyType = 'deleted' | 'info' | 'success' | 'warning';

interface Toast {
  id: number;
  type: NotifyType;
  title: string;
  body: string;
  ts: number;
}

let nextId = 0;
let container: HTMLElement | null = null;

const ICONS: Record<NotifyType, string> = {
  deleted: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

const COLORS: Record<NotifyType, string> = {
  deleted: '#f87171',
  info: '#60a5fa',
  success: '#34d399',
  warning: '#fbbf24',
};

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'sileo-toasts';
  document.body.appendChild(container);
  return container;
}

function createToastEl(toast: Toast): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sileo-toast';
  el.dataset.type = toast.type;
  el.style.setProperty('--accent', COLORS[toast.type]);

  el.innerHTML = `
    <div class="sileo-badge" style="background:${COLORS[toast.type]}">${ICONS[toast.type]}</div>
    <div class="sileo-content">
      <div class="sileo-title">${escapeHtml(toast.title)}</div>
      <div class="sileo-body">${escapeHtml(toast.body)}</div>
    </div>
    <button class="sileo-close" aria-label="Dismiss">&times;</button>
  `;

  el.querySelector('.sileo-close')!.addEventListener('click', () => dismiss(el));
  el.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.sileo-close')) dismiss(el);
  });

  return el;
}

function dismiss(el: HTMLElement) {
  el.classList.add('sileo-exit');
  el.addEventListener('animationend', () => el.remove());
}

function show(type: NotifyType, title: string, body: string, duration = 6000) {
  const toast: Toast = { id: ++nextId, type, title, body, ts: Date.now() };
  const c = ensureContainer();
  const el = createToastEl(toast);
  c.appendChild(el);

  requestAnimationFrame(() => el.classList.add('sileo-enter'));

  if (duration > 0) {
    setTimeout(() => {
      if (el.parentNode) dismiss(el);
    }, duration);
  }

  return toast.id;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const notify = {
  deleted: (sender: string, preview: string) =>
    show('deleted', `${sender} deleted a message`, preview),
  info: (title: string, body = '') => show('info', title, body),
  success: (title: string, body = '') => show('success', title, body),
  warning: (title: string, body = '') => show('warning', title, body),
};
