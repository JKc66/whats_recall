import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { currentChatId, setCurrentChatId, messages, chats, showOnlyDeleted } from './store';
import { avatarColor, getInitials, formatTime, mediaIcon, extractPhone, profilePicUrl } from './utils';
import type { Message, Reaction } from './types';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function groupReactions(reactions: Reaction[]): { emoji: string; count: number; senders: string[] }[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const list = map.get(r.emoji) || [];
    list.push(r.sender_name || r.sender_id);
    map.set(r.emoji, list);
  }
  return Array.from(map.entries()).map(([emoji, senders]) => ({ emoji, count: senders.length, senders }));
}

export default function ChatView() {
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null);
  let containerRef: HTMLDivElement | undefined;

  const chat = () => chats().find((c) => c.chat_id === currentChatId());

  const displayMessages = () => {
    const msgs = messages();
    if (showOnlyDeleted()) return msgs.filter((m) => m.is_deleted);
    return msgs;
  };

  createEffect(() => {
    if (currentChatId()) {
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

  function scrollToMessage(messageId: string) {
    if (!containerRef) return;
    const el = containerRef.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 1500);
    }
  }

  function findMessageByStanzaId(stanzaId: string): Message | undefined {
    return messages().find(m => m.message_id === stanzaId || m.original_id === stanzaId);
  }

  return (
    <>
      <Show when={!currentChatId()}>
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">💬</div>
          <h2>Message Monitor</h2>
          <p>Select a chat to view messages. Deleted messages are highlighted and preserved.</p>
          <p class="empty-hint">Go to Settings to add chats you want to monitor.</p>
        </div>
      </Show>

      <Show when={currentChatId()}>
        <header class="chat-header">
          <button class="icon-btn back-btn" onClick={back} aria-label="Back to chat list">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="chat-header-info">
            <Show when={profilePicUrl(chat()?.profile_pic)} fallback={
              <div class="avatar sm" style={{ background: avatarColor(chat()?.name || '?') }}>
                {getInitials(chat()?.name || '?')}
              </div>
            }>
              <div class="avatar sm avatar-dp" style={{ background: avatarColor(chat()?.name || '?') }}>
                <span class="avatar-initials">{getInitials(chat()?.name || '?')}</span>
                <img class="avatar-img" src={profilePicUrl(chat()?.profile_pic)!} alt="" width="34" height="34" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            </Show>
            <div>
              <h2>{chat()?.name || currentChatId()}</h2>
              <span class="subtitle">
                {chat()?.is_group ? 'Group' : 'Private'} · {chat()?.total_deleted_count ?? 0} deleted messages
                <Show when={!chat()?.is_group && currentChatId()}>
                  {' · '}{extractPhone(currentChatId()!)}
                </Show>
              </span>
            </div>
          </div>
          <div class="chat-header-actions">
          </div>
        </header>

        <div class="messages-container" ref={(el) => (containerRef = el)}>
          <Show when={displayMessages().length > 0} fallback={
            <div class="list-empty">
              No {showOnlyDeleted() ? 'deleted ' : ''}messages in this chat
            </div>
          }>
            <MsgList
              messages={displayMessages()}
              isGroup={!!chat()?.is_group}
              onImageClick={setLightboxSrc}
              onQuoteClick={scrollToMessage}
              findMessage={findMessageByStanzaId}
            />
          </Show>
        </div>
      </Show>

      <Show when={lightboxSrc()}>
        <div class="lightbox" onClick={closeLightbox} role="dialog" aria-label="Image preview">
          <img src={lightboxSrc()!} alt="Full size preview" />
        </div>
      </Show>
    </>
  );
}

function MsgList(props: {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (src: string) => void;
  onQuoteClick: (messageId: string) => void;
  findMessage: (stanzaId: string) => Message | undefined;
}) {
  let lastDate = '';

  // Group consecutive images from the same sender within 60 seconds
  function groupMessages(msgs: Message[]) {
    const groups: { type: 'single' | 'image-group'; messages: Message[]; dateStr?: string; showDate?: boolean }[] = [];
    let i = 0;
    while (i < msgs.length) {
      const msg = msgs[i];
      const msgDate = new Date(msg.timestamp * 1000);
      const dateStr = msgDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const showDate = dateStr !== lastDate;
      if (showDate) lastDate = dateStr;

      // Check if this is an image that can be grouped
      const isImage = msg.has_media && msg.media_path && (msg.type === 'image' || (msg.media_type || '').startsWith('image/'));
      if (isImage) {
        const imageGroup: Message[] = [msg];
        let j = i + 1;
        while (j < msgs.length) {
          const next = msgs[j];
          const nextIsImage = next.has_media && next.media_path && (next.type === 'image' || (next.media_type || '').startsWith('image/'));
          const sameSender = next.is_from_me === msg.is_from_me && next.sender_id === msg.sender_id;
          const within60s = Math.abs(next.timestamp - msg.timestamp) < 60;
          if (nextIsImage && sameSender && within60s) {
            imageGroup.push(next);
            j++;
          } else break;
        }
        if (imageGroup.length > 1) {
          groups.push({ type: 'image-group', messages: imageGroup, dateStr, showDate });
          i = j;
          continue;
        }
      }

      groups.push({ type: 'single', messages: [msg], dateStr, showDate });
      i++;
    }
    return groups;
  }

  const grouped = () => {
    lastDate = '';
    return groupMessages(props.messages);
  };

  return (
    <For each={grouped()}>
      {(group) => (
        <>
          <Show when={group.showDate}>
            <div class="date-sep"><span>{group.dateStr}</span></div>
          </Show>
          <Show when={group.type === 'image-group'} fallback={
            <MsgBubble
              msg={group.messages[0]}
              isGroup={props.isGroup}
              onImageClick={props.onImageClick}
              onQuoteClick={props.onQuoteClick}
              findMessage={props.findMessage}
            />
          }>
            <ImageGroup
              messages={group.messages}
              isGroup={props.isGroup}
              onImageClick={props.onImageClick}
              onQuoteClick={props.onQuoteClick}
              findMessage={props.findMessage}
            />
          </Show>
        </>
      )}
    </For>
  );
}

function ImageGroup(props: {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (src: string) => void;
  onQuoteClick: (messageId: string) => void;
  findMessage: (stanzaId: string) => Message | undefined;
}) {
  const first = () => props.messages[0];
  const dir = () => first().is_from_me ? 'out' : 'in';
  const time = () => formatTime(new Date(props.messages[props.messages.length - 1].timestamp * 1000));
  const phone = () => first().sender_id ? extractPhone(first().sender_id!) : '';

  function mediaUrl(path: string) {
    return `${BASE}/api/media/${encodeURIComponent(path)}`;
  }

  return (
    <div class={`msg ${dir()} image-group-bubble`} data-msg-id={first().message_id}>
      <Show when={props.isGroup && !first().is_from_me}>
        <div class="msg-sender" style={{ color: avatarColor(first().sender_name || phone()) }}>
          {first().sender_name || phone() || 'Unknown'}
        </div>
      </Show>
      <div class="image-grid grid-2">
        <For each={props.messages}>
          {(msg) => (
            <div class="image-grid-item" data-msg-id={msg.message_id}>
              <img
                src={mediaUrl(msg.media_path!)}
                alt="Image"
                loading="lazy"
                onClick={() => props.onImageClick(mediaUrl(msg.media_path!))}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </For>
      </div>
      <Show when={first().body}>
        <div class="msg-body">{first().body}</div>
      </Show>
      <div class="msg-meta">
        <span class="image-count">{props.messages.length} photos</span>
        <span class="time">{time()}</span>
      </div>
    </div>
  );
}

function MsgBubble(props: {
  msg: Message;
  isGroup: boolean;
  onImageClick: (src: string) => void;
  onQuoteClick: (messageId: string) => void;
  findMessage: (stanzaId: string) => Message | undefined;
}) {
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
            <span class="icon" aria-hidden="true">{mediaIcon(msg.type)}</span> {msg.type}
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
            alt={type === 'sticker' ? 'Sticker' : 'Image'}
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
        <span class="icon" aria-hidden="true">📄</span>
        <a href={src} target="_blank" rel="noopener">{msg.media_filename || 'Download'}</a>
      </div>
    );
  }

  const phone = () => m().sender_id ? extractPhone(m().sender_id!) : '';
  const isViewOnce = () => !!m().is_view_once;

  // Reply data from new DB fields (or fallback to body parsing for legacy data)
  const replyData = () => {
    const msg = m();
    // New system: quoted fields stored in DB
    if (msg.quoted_stanza_id) {
      return {
        stanzaId: msg.quoted_stanza_id,
        preview: msg.quoted_preview || '',
        sender: msg.quoted_sender || '',
      };
    }
    // Legacy fallback: parse from body
    if (msg.body && msg.body.startsWith('[Replying to: ')) {
      const newlineIndex = msg.body.indexOf(']\n\n');
      if (newlineIndex > -1) {
        return {
          stanzaId: null,
          preview: msg.body.slice(14, newlineIndex),
          sender: '',
        };
      }
    }
    return null;
  };

  const bodyText = () => {
    const msg = m();
    if (!msg.body) return '';
    // Strip legacy reply prefix from body
    if (msg.body.startsWith('[Replying to: ')) {
      const newlineIndex = msg.body.indexOf(']\n\n');
      if (newlineIndex > -1) {
        return msg.body.slice(newlineIndex + 3);
      }
    }
    return msg.body;
  };

  function handleQuoteClick() {
    const reply = replyData();
    if (!reply?.stanzaId) return;
    const target = props.findMessage(reply.stanzaId);
    if (target) {
      props.onQuoteClick(target.message_id);
    }
  }

  return (
    <div class={`msg ${dir()}`} classList={{ deleted: isDeleted(), 'view-once': isViewOnce(), 'has-reactions': m().reactions && m().reactions.length > 0 }} data-msg-id={m().message_id}>
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
        <div class="view-once-tag">👁 View once</div>
      </Show>

      <Show when={replyData()}>
        <div
          class="msg-reply-bar"
          classList={{ clickable: !!replyData()?.stanzaId }}
          onClick={handleQuoteClick}
        >
          <Show when={replyData()?.sender}>
            <div class="msg-reply-sender">{replyData()!.sender.split('@')[0]}</div>
          </Show>
          <div class="msg-reply-text">{replyData()!.preview || 'Message'}</div>
        </div>
      </Show>

      {renderMedia()}

      <Show when={bodyText()}>
        <div class="msg-body">{bodyText()}</div>
      </Show>

      <Show when={isViewOnce() && !bodyText() && !m().has_media}>
        <div class="msg-media-placeholder">
          <span class="icon" aria-hidden="true">👁</span> View-once {m().type || 'message'}
        </div>
      </Show>

      <Show when={m().reactions && m().reactions.length > 0}>
        <div class="msg-reactions">
          <For each={groupReactions(m().reactions)}>
            {(group) => (
              <span class="reaction-pill" title={group.senders.join(', ')}>
                <span class="reaction-emoji">{group.emoji}</span>
                <Show when={group.count > 1}>
                  <span class="reaction-count">{group.count}</span>
                </Show>
              </span>
            )}
          </For>
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
