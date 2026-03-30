import { createSignal, createMemo, createEffect, Show, For, onCleanup } from 'solid-js';
import { currentChatId, setCurrentChatId, messages, chats, showOnlyDeleted, setView } from './store';
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

function MediaGallery(props: { 
  messages: Message[]; 
  onImageClick: (src: string) => void;
  onJumpToMessage: (id: string) => void;
}) {
  function mediaUrl(path: string) {
    return `${BASE}/api/media/${encodeURIComponent(path)}`;
  }

  return (
    <div class="gallery-view">
      <Show when={props.messages.length > 0} fallback={<div class="list-empty">No media found in this chat</div>}>
        <div class="gallery-grid">
          <For each={props.messages}>
            {(msg) => {
              const src = mediaUrl(msg.media_path!);
              const type = msg.type;
              return (
                <div class="gallery-item" classList={{ deleted: !!msg.is_deleted }}>
                  <Show when={type === 'image' || type === 'sticker'}>
                    <img 
                      src={src} 
                      alt="" 
                      loading="lazy" 
                      onClick={() => props.onImageClick(src)}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                  </Show>
                  <Show when={type === 'video'}>
                    <div class="gallery-video-preview" onClick={() => props.onImageClick(src)}>
                      <video src={src} preload="metadata" />
                      <div class="video-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3" /></svg></div>
                    </div>
                  </Show>
                  <Show when={type === 'audio' || type === 'ptt'}>
                    <div class="gallery-audio-item">
                       <div class="audio-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>
                      <audio src={src} controls preload="metadata" />
                    </div>
                  </Show>
                  <Show when={type === 'document'}>
                    <div class="gallery-doc-item">
                       <div class="doc-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg></div>
                      <span class="doc-name">{msg.media_filename || 'Document'}</span>
                    </div>
                  </Show>
                  
                  <div class="gallery-item-hover">
                    <div class="gallery-item-info">
                      <span class="gallery-item-time">{formatTime(new Date(msg.timestamp * 1000))}</span>
                      <Show when={!!msg.is_deleted}>
                        <span class="gallery-item-tag deleted">Deleted</span>
                      </Show>
                    </div>
                    <button class="gallery-item-btn" onClick={() => props.onJumpToMessage(msg.message_id)}>
                      Jump to message
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function ChatView() {
  const [lightboxSrc, setLightboxSrc] = createSignal<string | null>(null);
  const [viewMode, setViewMode] = createSignal<'messages' | 'media'>('messages');
  let containerRef: HTMLDivElement | undefined;

  const chat = () => chats().find((c) => c.chat_id === currentChatId());

  // ⚡ Bolt: Memoize filtered messages to prevent O(N) recalculations on unrelated state changes
  const displayMessages = createMemo(() => {
    const msgs = messages();
    if (showOnlyDeleted()) return msgs.filter((m) => m.is_deleted);
    return msgs;
  });

  // ⚡ Bolt: Cache media filter to prevent re-evaluation on every render cycle
  const mediaMessages = createMemo(() => messages().filter(m => m.has_media && m.media_path && m.type !== 'sticker'));

  createEffect(() => {
    if (currentChatId()) {
      setViewMode('messages');
      requestAnimationFrame(() => scrollToBottom());
    }
  });

  createEffect(() => {
    messages();
    if (viewMode() === 'messages') {
      requestAnimationFrame(() => scrollToBottom());
    }
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
          <div class="empty-icon" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
          <h2>Message Monitor</h2>
          <p>Select a chat to view messages. Deleted messages are highlighted and preserved.</p>
          <button
            class="btn-outline btn-configure"
            onClick={() => setView('settings')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Configure Chats
          </button>
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
            <div style={{ flex: 1 }}>
              <h2>{chat()?.name || currentChatId()}</h2>
              <span class="subtitle">
                {chat()?.is_group ? 'Group' : 'Private'} · {chat()?.total_deleted_count ?? 0} deleted
              </span>
            </div>
            
            <div class="chat-mode-tabs" role="tablist">
              <button class="chat-mode-tab" role="tab" aria-selected={viewMode() === 'messages'} classList={{ active: viewMode() === 'messages' }} onClick={() => setViewMode('messages')}>
                Messages
              </button>
              <button class="chat-mode-tab" role="tab" aria-selected={viewMode() === 'media'} classList={{ active: viewMode() === 'media' }} onClick={() => setViewMode('media')}>
                Media Gallery
              </button>
            </div>
          </div>
        </header>

        <div class="messages-container" ref={(el) => (containerRef = el)} classList={{ gallery: viewMode() === 'media' }}>
          <Show when={viewMode() === 'messages'}>
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
          </Show>
          
          <Show when={viewMode() === 'media'}>
            <MediaGallery 
              messages={mediaMessages()} 
              onImageClick={setLightboxSrc} 
              onJumpToMessage={(id: string) => { setViewMode('messages'); setTimeout(() => scrollToMessage(id), 50); }}
            />
          </Show>
        </div>
      </Show>

      <Show when={lightboxSrc()}>
        <div class="lightbox" onClick={closeLightbox} role="dialog" aria-label="Image preview">
          <button class="lightbox-close" onClick={closeLightbox} aria-label="Close preview">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <img src={lightboxSrc()!} alt="Full size preview" onClick={(e) => e.stopPropagation()} />
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

      // Check if this is an image or an empty "album marker" message
      const isImage = msg.has_media && msg.media_path && (msg.type === 'image' || (msg.media_type || '').startsWith('image/'));
      const isEmpty = !msg.body && !msg.has_media;

      // If first is an image OR an empty marker (which might be the head of an album)
      if (isImage || (isEmpty && i + 1 < msgs.length && msgs[i + 1].has_media)) {
        const imageGroup: Message[] = [msg];
        let j = i + 1;
        while (j < msgs.length) {
          const next = msgs[j];
          const nextIsImage = next.has_media && next.media_path && (next.type === 'image' || (next.media_type || '').startsWith('image/'));
          const nextIsEmpty = !next.body && !next.has_media;
          const sameSender = next.is_from_me === msg.is_from_me && next.sender_id === msg.sender_id;
          const withinBurst = Math.abs(next.timestamp - msg.timestamp) <= 2; // Increased to 2s to catch album markers

          if ((nextIsImage || nextIsEmpty) && sameSender && withinBurst) {
            imageGroup.push(next);
            j++;
          } else break;
        }

        // Only treat as a group if there are at least TWO images or one image + an empty album marker
        const images = imageGroup.filter(m => m.has_media && m.media_path);
        if (images.length > 1 || (images.length === 1 && imageGroup.length > 1)) {
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

  const DownloadBtn = (props: { url: string; filename?: string }) => (
    <a
      href={props.url}
      download={props.filename || 'download'}
      class="download-btn"
      onClick={(e) => e.stopPropagation()}
      aria-label="Download media"
      title="Download media"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v2" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );

  const imageCount = () => props.messages.filter(m => m.has_media && m.media_path).length;

  function downloadAll() {
    props.messages.filter(m => m.has_media && m.media_path).forEach((msg, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = mediaUrl(msg.media_path!);
        link.download = msg.media_filename || `image_${index}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 200); // 200ms delay to help browser manage multiple popups
    });
  }

  const gridClass = () => {
    const n = imageCount();
    if (n === 1) return 'grid-single';
    if (n === 2) return 'grid-2';
    if (n === 3) return 'grid-3';
    return 'grid-4'; // multiple rows of 2
  };

  return (
    <div class={`msg ${dir()} image-group-bubble`} data-msg-id={first().message_id}>
      <Show when={props.isGroup && !first().is_from_me}>
        <div class="msg-sender" style={{ color: avatarColor(first().sender_name || phone()) }}>
          {first().sender_name || phone() || 'Unknown'}
        </div>
      </Show>
      <div class={`image-grid ${gridClass()}`}>
        <For each={props.messages.filter(m => m.has_media && m.media_path)}>
          {(msg) => (
            <div class="image-grid-item" data-msg-id={msg.message_id} classList={{ deleted: !!msg.is_deleted }}>
              <img
                src={mediaUrl(msg.media_path!)}
                alt="Image"
                loading="lazy"
                onClick={() => props.onImageClick(mediaUrl(msg.media_path!))}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <DownloadBtn url={mediaUrl(msg.media_path!)} filename={msg.media_filename || undefined} />
              <Show when={!!msg.is_deleted}>
                <div class="image-grid-deleted-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg> Deleted
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={first().body}>
        <div class="msg-body">{first().body}</div>
      </Show>
      <div class="msg-meta">
        <Show when={props.messages.some(m => m.reactions && m.reactions.length > 0)}>
          <div class="msg-reactions">
            <For each={groupReactions(props.messages.flatMap(m => m.reactions || []))}>
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
        <span class="image-count">{props.messages.filter(m => m.has_media).length} photos</span>
        <Show when={imageCount() > 1}>
          <button
            class="download-all-btn"
            onClick={downloadAll}
            title="Download all images in this album"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v2" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Album
          </button>
        </Show>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> {msg.type}
          </div>
        );
      }
      return null;
    }

    const src = mediaUrl(msg.media_path);
    const mt = (msg.media_type || '').toLowerCase();
    const type = msg.type;

    const DownloadBtn = (props: { url: string; filename?: string }) => (
      <a
        href={props.url}
        download={props.filename || 'download'}
        class="download-btn"
        onClick={(e) => e.stopPropagation()}
        aria-label="Download media"
        title="Download media"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v2" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </a>
    );

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
          <Show when={type !== 'sticker'}>
            <DownloadBtn url={src} filename={msg.media_filename || undefined} />
          </Show>
        </div>
      );
    }
    if (type === 'video' || mt.startsWith('video/')) {
      return (
        <div class="msg-media">
          <video src={src} controls preload="metadata" />
          <DownloadBtn url={src} filename={msg.media_filename || undefined} />
        </div>
      );
    }
    if (type === 'audio' || type === 'ptt' || mt.startsWith('audio/')) {
      return (
        <div class="msg-media">
          <audio src={src} controls preload="metadata" />
          <DownloadBtn url={src} filename={msg.media_filename || undefined} />
        </div>
      );
    }
    return (
      <div class="msg-media-placeholder">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
        <a href={src} target="_blank" rel="noopener">{msg.media_filename || 'Download'}</a>
        <DownloadBtn url={src} filename={msg.media_filename || undefined} />
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
        <div class="view-once-tag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>View once</div>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> View-once {m().type || 'message'}
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
