import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { currentChatId, setCurrentChatId, messages, chats, setMessages } from './store';
import { avatarColor, getInitials, formatTime, mediaIcon } from './utils';
import type { Message } from './types';

export default function ChatView() {
  const [filterDeleted, setFilterDeleted] = createSignal(false);
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null);
  let containerRef: HTMLDivElement | undefined;

  const chat = () => chats().find((c) => c.chat_id === currentChatId());

  const displayMessages = () => {
    const msgs = messages();
    return filterDeleted() ? msgs.filter((m) => m.is_deleted) : msgs;
  };

  createEffect(() => {
    if (currentChatId()) {
      setFilterDeleted(false);
      requestAnimationFrame(() => scrollToBottom());
    }
  });

  createEffect(() => {
    messages();
    requestAnimationFrame(() => scrollToBottom());
  });

  function scrollToBottom() {
    if (containerRef) containerRef.scrollTop = containerRef.scrollHeight;
  }

  function closeLightbox() {
    setLightboxSrc(null);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (lightboxSrc()) closeLightbox();
      else back();
    }
  }

  createEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  function back() {
    setCurrentChatId(null);
  }

  return (
    <>
      <Show when={!currentChatId()}>
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <h2>WhatsApp Message Monitor</h2>
          <p>Select a chat to view messages. Deleted messages are highlighted and preserved.</p>
          <p class="empty-hint">Go to ⚙ Settings to add chats you want to monitor.</p>
        </div>
      </Show>

      <Show when={currentChatId()}>
        <header class="chat-header">
          <button class="back-btn" onClick={back}>←</button>
          <div class="chat-header-info">
            <div class="chat-avatar sm" style={{ background: avatarColor(chat()?.name || '?') }}>
              {getInitials(chat()?.name || '?')}
            </div>
            <div>
              <h2>{chat()?.name || currentChatId()}</h2>
              <span class="subtitle">
                {chat()?.is_group ? 'Group' : 'Private'} · {chat()?.total_messages ?? 0} messages
              </span>
            </div>
          </div>
          <div class="chat-header-actions">
            <button
              onClick={() => setFilterDeleted(!filterDeleted())}
              classList={{ active: filterDeleted() }}
              title="Show deleted only"
            >
              🗑️
            </button>
          </div>
        </header>

        <div class="messages-container" ref={(el) => (containerRef = el)}>
          <Show when={displayMessages().length > 0} fallback={
            <div class="no-messages">
              {filterDeleted() ? 'No deleted messages in this chat' : 'No messages yet'}
            </div>
          }>
            <MessageList
              messages={displayMessages()}
              isGroup={!!chat()?.is_group}
              onImageClick={setLightboxSrc}
            />
          </Show>
        </div>
      </Show>

      <Show when={lightboxSrc()}>
        <div class="lightbox" onClick={closeLightbox}>
          <img src={lightboxSrc()!} alt="" />
        </div>
      </Show>
    </>
  );
}

function MessageList(props: {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (src: string) => void;
}) {
  let lastDate = '';

  return (
    <For each={props.messages}>
      {(msg) => {
        const msgDate = new Date(msg.timestamp * 1000);
        const dateStr = msgDate.toLocaleDateString(undefined, {
          year: 'numeric', month: 'long', day: 'numeric',
        });
        const showDate = dateStr !== lastDate;
        if (showDate) lastDate = dateStr;

        return (
          <>
            <Show when={showDate}>
              <div class="date-separator"><span>{dateStr}</span></div>
            </Show>
            <MessageBubble
              msg={msg}
              isGroup={props.isGroup}
              onImageClick={props.onImageClick}
            />
          </>
        );
      }}
    </For>
  );
}

function MessageBubble(props: {
  msg: Message;
  isGroup: boolean;
  onImageClick: (src: string) => void;
}) {
  const m = () => props.msg;
  const dir = () => m().is_from_me ? 'out' : 'in';
  const time = () => formatTime(new Date(m().timestamp * 1000));

  function renderMedia() {
    const msg = m();
    if (!msg.has_media || !msg.media_path) {
      if (msg.has_media) {
        return (
          <div class="media-placeholder">
            <span class="icon">{mediaIcon(msg.type)}</span> {msg.type}
          </div>
        );
      }
      return null;
    }

    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const src = `${base}/api/media/${encodeURIComponent(msg.media_path)}`;

    if (msg.type === 'image' || msg.type === 'sticker') {
      return (
        <div class="media-content">
          <img src={src} alt="" loading="lazy" onClick={() => props.onImageClick(src)} />
        </div>
      );
    }
    if (msg.type === 'video') {
      return (
        <div class="media-content">
          <video src={src} controls preload="metadata" />
        </div>
      );
    }
    if (msg.type === 'audio' || msg.type === 'ptt') {
      return (
        <div class="media-content">
          <audio src={src} controls preload="metadata" />
        </div>
      );
    }
    return (
      <div class="media-placeholder">
        <span class="icon">📄</span>
        <a href={src} target="_blank" rel="noopener">{msg.media_filename || 'Download'}</a>
      </div>
    );
  }

  return (
    <div
      class={`message ${dir()}`}
      classList={{ deleted: !!m().is_deleted }}
      data-msg-id={m().message_id}
    >
      <Show when={props.isGroup && !m().is_from_me && m().sender_name}>
        <div class="sender-name" style={{ color: avatarColor(m().sender_name || '') }}>
          {m().sender_name}
        </div>
      </Show>

      <Show when={m().is_deleted}>
        <div class="deleted-tag">🗑️ DELETED</div>
      </Show>

      {renderMedia()}

      <Show when={m().body}>
        <div class="body">{m().body}</div>
      </Show>

      <div class="meta">
        <span class="time">{time()}</span>
        <Show when={m().is_deleted && m().deleted_at}>
          <span class="deleted-time">
            deleted {formatTime(new Date(m().deleted_at!))}
          </span>
        </Show>
      </div>
    </div>
  );
}
