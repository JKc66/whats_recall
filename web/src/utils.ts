const AVATAR_COLORS = [
  '#0ea5e9', '#8b5cf6', '#f43f5e', '#f59e0b',
  '#06b6d4', '#a855f7', '#ec4899', '#10b981',
  '#6366f1', '#14b8a6', '#f97316', '#84cc16',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return formatTime(date);
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '…';
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mediaIcon(type: string): string {
  const icons: Record<string, string> = {
    image: '🖼️', video: '🎬', audio: '🎵',
    ptt: '🎙️', document: '📄', sticker: '🏷️',
  };
  return icons[type] || '📎';
}

export function extractPhone(id: string): string {
  if (!id) return '';
  return id.replace(/@[cgs]\..+$/, '').replace(/@newsletter$/, '');
}
