type SileoType = 'deleted' | 'info' | 'success' | 'warning' | 'error';

interface SileoToast {
  id: number;
  type: SileoType;
  title: string;
  body: string;
  ts: number;
}

let nextId = 0;
let container: HTMLElement | null = null;

const ICONS: Record<SileoType, string> = {
  deleted: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

const COLORS: Record<SileoType, string> = {
  deleted: '#fb7185',
  info: '#38bdf8',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
};

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'sileo-toasts';
  document.body.appendChild(container);
  return container;
}

function createToastEl(toast: SileoToast): HTMLElement {
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
    <div class="sileo-progress" style="background:${COLORS[toast.type]}"></div>
  `;

  el.querySelector('.sileo-close')!.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss(el);
  });
  el.addEventListener('click', () => dismiss(el));

  return el;
}

function dismiss(el: HTMLElement) {
  if (el.classList.contains('sileo-exit')) return;
  el.classList.add('sileo-exit');
  el.addEventListener('animationend', () => el.remove());
}

function show(type: SileoType, title: string, body: string, duration = 5000) {
  const toast: SileoToast = { id: ++nextId, type, title, body, ts: Date.now() };
  const c = ensureContainer();
  const el = createToastEl(toast);
  c.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('sileo-enter');
    const progress = el.querySelector('.sileo-progress') as HTMLElement;
    if (progress && duration > 0) {
      progress.style.animationDuration = `${duration}ms`;
      progress.classList.add('sileo-progress-run');
    }
  });

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
  error: (title: string, body = '') => show('error', title, body),
};

export const sileo = notify;
