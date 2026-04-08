import { extractJidId } from "../../src/shared/jid";

export { extractJidId };

/**
 * Same hash drives both arrays so a contact’s sidebar chip and group header color stay paired.
 * Dark fills: white initials. Label hues: distinct per participant in groups (exception: AGENTS.md chrome palette).
 */
const AVATAR_BG_COLORS = [
  "#1A1A1A",
  "#222222",
  "#262626",
  "#2A2A2A",
  "#2E2E2E",
  "#323232",
  "#282828",
  "#1E1E1E",
  "#303030",
  "#242424",
  "#2C2C2C",
  "#343434",
];

/** Saturated distinct hues for group sender names (readable on dark bubbles). */
const AVATAR_LABEL_COLORS = [
  "#FF5C5C",
  "#5CFF9D",
  "#5C9DFF",
  "#FFD15C",
  "#D15CFF",
  "#5CFFEA",
  "#FF8E5C",
  "#FF5C9D",
  "#A8FF5C",
  "#5C61FF",
  "#7EB6FF",
  "#C4B5FD",
];

function avatarTintIndex(name: string): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_BG_COLORS.length;
}

/** Dark fill for avatar / initials chips (`text-white` on top). */
export function avatarBgColor(name: string): string {
  return AVATAR_BG_COLORS[avatarTintIndex(name)];
}

/** Per-peer color for group sender names (distinct hues). */
export function avatarLabelColor(name: string): string {
  return AVATAR_LABEL_COLORS[avatarTintIndex(name)];
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
  if (days === 1) return "YESTERDAY";
  if (days < 7) return dayFormatter.format(date);
  return fullDateFormatter.format(date);
}

/** Formats seconds as `m:ss` for media players. */
export function formatDurationSeconds(time: number): string {
  if (Number.isNaN(time)) return "0:00";
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str || "";
  return str.slice(0, max) + "…";
}

export function getDisplayName(chat: { name?: string | null; chat_id?: string; id?: string; isMe?: boolean } | undefined, fallbackId?: string): string {
  const id = chat?.chat_id || chat?.id || fallbackId || "";
  if (!chat && !id) return "UNKNOWN";
  if (chat?.isMe && (!chat?.name || chat.name === extractJidId(id))) return "YOU";
  
  const name = chat?.name;
  const jidId = extractJidId(id);
  
  if (!name || name === jidId || name.includes('@lid')) {
    return jidId || "UNNAMED";
  }
  
  return name;
}

export const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export function mediaUrl(path: string): string {
  return `${BASE_URL}/api/media/${encodeURIComponent(path)}`;
}

export function profilePicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return mediaUrl(path);
}
