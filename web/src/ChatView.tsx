import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { currentChatId, setCurrentChatId, messages, chats, setMessages } from './store';
import { avatarColor, getInitials, formatTime, mediaIcon, extractPhone, profilePicUrl } from './utils';
import type { Message } from './types';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

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

  function closeLightbox() { setLightboxSrc(null); }

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

  function back() { setCurrentChatId(null); }

  return (
    <>
      <Show when={!currentChatId()}>
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <h2>WhatsApp Message Monitor</h2>
          <p>Select a chat to view messages. Deleted messages are highlighted and preserved.</p>
          <p class="empty-hint">Go to Settings to add chats you want to monitor.</p>
        </div>
      </Show>

      <Show when={currentChatId()}>
        <header class="chat-header">
          <button class="icon-btn back-btn" onClick={back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="chat-header-info">
            <Show when={profilePicUrl(chat()?.profile_pic)} fallback={
              <div class="avatar sm" style={{ background: avatarColor(chat()?.name || '?') }}>
                {getInitials(chat()?.name || '?')}
              </div>
            }>
              <div class="avatar sm avatar-dp" style={{ background: avatarColor(chat()?.name || '?') }}>
                <span class="avatar-initials">{getInitials(chat()?.name || '?')}</span>
                <img class="avatar-img" src={profilePicUrl(chat()?.profile_pic)!} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            </Show>
            <div>
              <h2>{chat()?.name || currentChatId()}</h2>
              <span class="subtitle">
                {chat()?.is_group ? 'Group' : 'Private'} · {chat()?.total_messages ?? 0} messages
                <Show when={!chat()?.is_group && currentChatId()}>
                  {' · '}{extractPhone(currentChatId()!)}
                </Show>
              </span>
            </div>
          </div>
          <div class="chat-header-actions">
            <button
              class="icon-btn"
              classList={{ active: filterDeleted() }}
              onClick={() => setFilterDeleted(!filterDeleted())}
              title="Show deleted only"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </header>

        <div class="messages-container" ref={(el) => (containerRef = el)}>
          <Show when={displayMessages().length > 0} fallback={
            <div class="list-empty">
              {filterDeleted() ? 'No deleted messages in this chat' : 'No messages yet'}
            </div>
          }>
            <MsgList messages={displayMessages()} isGroup={!!chat()?.is_group} onImageClick={setLightboxSrc} />
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

function MsgList(props: { messages: Message[]; isGroup: boolean; onImageClick: (src: string) => void }) {
  let lastDate = '';

  return (
    <For each={props.messages}>
      {(msg) => {
        const msgDate = new Date(msg.timestamp * 1000);
        const dateStr = msgDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const showDate = dateStr !== lastDate;
        if (showDate) lastDate = dateStr;

        return (
          <>
            <Show when={showDate}>
              <div class="date-sep"><span>{dateStr}</span></div>
            </Show>
            <MsgBubble msg={msg} isGroup={props.isGroup} onImageClick={props.onImageClick} />
          </>
        );
      }}
    </For>
  );
}

function MsgBubble(props: { msg: Message; isGroup: boolean; onImageClick: (src: string) => void }) {
  const m = () => props.msg;
  const dir = () => m().is_from_me ? 'out' : 'in';
  const time = () => formatTime(new Date(m().timestamp * 1000));
  const isDeleted = () => !!m().is_deleted;

  function mediaUrl(path: string) {
    return `${BASE}/api/media/${encodeURIComponent(path)}`;
  }

  function renderMedia() {
    const msg = m();
    if (!msg.has_media || !msg.media_path) {
      if (msg.has_media) {
        return (
          <div class="msg-media-placeholder">
            <span class="icon">{mediaIcon(msg.type)}</span> {msg.type}
          </div>
        );
      }
      return null;
    }

    const src = mediaUrl(msg.media_path);
    const mt = (msg.media_type || '').toLowerCase();
    const type = msg.type;

    if (type === 'image' || type === 'sticker' || mt.startsWith('image/')) {
      return (
        <div class="msg-media" classList={{ sticker: type === 'sticker' }}>
          <img
            src={src}
            alt=""
            loading="lazy"
            onClick={() => props.onImageClick(src)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      );
    }
    if (type === 'video' || mt.startsWith('video/')) {
      return (
        <div class="msg-media">
          <video src={src} controls preload="metadata" />
        </div>
      );
    }
    if (type === 'audio' || type === 'ptt' || mt.startsWith('audio/')) {
      return (
        <div class="msg-media">
          <audio src={src} controls preload="metadata" />
        </div>
      );
    }
    return (
      <div class="msg-media-placeholder">
        <span class="icon">📄</span>
        <a href={src} target="_blank" rel="noopener">{msg.media_filename || 'Download'}</a>
      </div>
    );
  }

  const phone = () => m().sender_id ? extractPhone(m().sender_id) : '';
  const isViewOnce = () => !!m().is_view_once;

  return (
    <div class={`msg ${dir()}`} classList={{ deleted: isDeleted(), 'view-once': isViewOnce() }} data-msg-id={m().message_id}>
      <Show when={props.isGroup && !m().is_from_me}>
        <div class="msg-sender" style={{ color: avatarColor(m().sender_name || phone()) }}>
          {m().sender_name || phone() || 'Unknown'}
          <Show when={phone() && m().sender_name}>
            <span class="msg-sender-phone">{phone()}</span>
          </Show>
        </div>
      </Show>

      <Show when={!props.isGroup && !m().is_from_me && !m().sender_name && phone()}>
        <div class="msg-sender" style={{ color: avatarColor(phone()) }}>
          {phone()}
        </div>
      </Show>

      <Show when={isViewOnce()}>
        <div class="view-once-tag">👁 View Once</div>
      </Show>

      {renderMedia()}

      <Show when={m().body}>
        <div class="msg-body">{m().body}</div>
      </Show>

      <Show when={isViewOnce() && !m().body && !m().has_media}>
        <div class="msg-media-placeholder">
          <span class="icon">👁</span> View-once {m().type || 'message'}
        </div>
      </Show>

      <div class="msg-meta">
        <span class="time">{time()}</span>
        <Show when={isViewOnce()}>
          <span class="view-once-badge">view once</span>
        </Show>
        <Show when={isDeleted()}>
          <span class="del-tag">deleted</span>
        </Show>
      </div>
    </div>
  );
}
