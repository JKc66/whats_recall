const AVATAR_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f43f5e",
  "#f59e0b",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return formatTime(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return dayFormatter.format(date);
  return fullDateFormatter.format(date);
}

export function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str || "";
  return str.slice(0, max) + "…";
}

export function extractJidId(id: string | null | undefined): string {
  if (!id) return "";
  return id.replace(/@[cgs]\..+$/, "").replace(/@newsletter$/, "");
}

export function getDisplayName(chat: { name?: string | null; chat_id?: string; id?: string } | undefined, fallbackId?: string): string {
  const id = chat?.chat_id || chat?.id || fallbackId || "";
  if (!chat && !id) return "Unknown";
  return chat?.name || extractJidId(id) || id;
}

export const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export function mediaUrl(path: string): string {
  return `${BASE_URL}/api/media/${encodeURIComponent(path)}`;
}

export function profilePicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return mediaUrl(path);
}
