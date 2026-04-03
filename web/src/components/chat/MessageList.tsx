import { For, Show } from "solid-js";
import type { Message } from "../../types";
import { MessageBubble, ImageGroup } from "./MessageBubble";

interface MessageListProps {
  messages: Message[];
  isGroup: boolean;
  onImageClick: (_src: string) => void;
  onQuoteClick: (_messageId: string) => void;
  findMessage: (_stanzaId: string) => Message | undefined;
  highlightQuery?: string;
}

const messageListDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function MessageList(props: MessageListProps) {
  let lastDate = "";

  function groupMessages(msgs: Message[]) {
    const groups: {
      type: "single" | "image-group";
      messages: Message[];
      dateStr?: string;
      showDate?: boolean;
    }[] = [];
    let i = 0;
    while (i < msgs.length) {
      const msg = msgs[i];
      const msgDate = new Date(msg.timestamp * 1000);
      const dateStr = messageListDateFormatter.format(msgDate);
      const showDate = dateStr !== lastDate;
      if (showDate) lastDate = dateStr;

      const isImage =
        msg.has_media &&
        msg.media_path &&
        (msg.type === "image" || (msg.media_type || "").startsWith("image/"));
      const isEmpty = !msg.body && !msg.has_media;

      if (
        isImage ||
        (isEmpty && i + 1 < msgs.length && msgs[i + 1].has_media)
      ) {
        const imageGroup: Message[] = [msg];
        let j = i + 1;
        while (j < msgs.length) {
          const next = msgs[j];
          const nextIsImage =
            next.has_media &&
            next.media_path &&
            (next.type === "image" ||
              (next.media_type || "").startsWith("image/"));
          const nextIsEmpty = !next.body && !next.has_media;
          const sameSender =
            next.is_from_me === msg.is_from_me &&
            next.sender_id === msg.sender_id;
          const withinBurst = Math.abs(next.timestamp - msg.timestamp) <= 2;

          if ((nextIsImage || nextIsEmpty) && sameSender && withinBurst) {
            imageGroup.push(next);
            j++;
          } else break;
        }

        const images = imageGroup.filter((m) => m.has_media && m.media_path);
        if (
          images.length > 1 ||
          (images.length === 1 && imageGroup.length > 1)
        ) {
          groups.push({
            type: "image-group",
            messages: imageGroup,
            dateStr,
            showDate,
          });
          i = j;
          continue;
        }
      }

      groups.push({ type: "single", messages: [msg], dateStr, showDate });
      i++;
    }
    return groups;
  }

  const grouped = () => {
    lastDate = "";
    return groupMessages(props.messages).reverse();
  };

  return (
    <div class="flex-1 flex flex-col-reverse gap-1.5 px-6 py-6 pb-24">
      <For each={grouped()}>
        {(group) => (
          <>
            <Show
              when={group.type === "image-group"}
              fallback={
                <MessageBubble
                  msg={group.messages[0]}
                  isGroup={props.isGroup}
                  onImageClick={props.onImageClick}
                  onQuoteClick={props.onQuoteClick}
                  findMessage={props.findMessage}
                  highlightQuery={props.highlightQuery}
                />
              }
            >
              <ImageGroup
                messages={group.messages}
                isGroup={props.isGroup}
                onImageClick={props.onImageClick}
                onQuoteClick={props.onQuoteClick}
                findMessage={props.findMessage}
                highlightQuery={props.highlightQuery}
              />
            </Show>
            <Show when={group.showDate}>
              <div class="flex justify-center py-6 mb-2">
                <span class="bg-surface/80 backdrop-blur-md text-text-secondary text-[11px] font-bold py-1 px-4 rounded-full border border-border uppercase tracking-widest shadow-sm">
                  {group.dateStr}
                </span>
              </div>
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
