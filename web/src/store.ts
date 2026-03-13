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
  notifyEnabled: true,
  totalMessages: 0,
  deletedMessages: 0,
  totalChats: 0,
});
export const [view, setView] = createSignal<'chats' | 'settings'>('chats');
