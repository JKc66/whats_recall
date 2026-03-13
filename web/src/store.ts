import { createSignal } from 'solid-js';
import type { Chat, Message, Stats } from './types';

export const [authenticated, setAuthenticated] = createSignal<boolean | null>(null);
export const [chats, setChats] = createSignal<Chat[]>([]);
export const [currentChatId, setCurrentChatId] = createSignal<string | null>(null);
export const [messages, setMessages] = createSignal<Message[]>([]);
export const [stats, setStats] = createSignal<Stats>({
  connected: false,
  authenticated: false,
  myId: null,
  totalMessages: 0,
  deletedMessages: 0,
  totalChats: 0,
});
export const [view, setView] = createSignal<'chats' | 'settings'>('chats');
export const [toasts, setToasts] = createSignal<Array<{ id: number; title: string; body: string }>>([]);

let toastId = 0;
export function addToast(title: string, body: string) {
  const id = ++toastId;
  setToasts((t) => [...t, { id, title, body }]);
  setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
}

export function removeToast(id: number) {
  setToasts((t) => t.filter((x) => x.id !== id));
}
