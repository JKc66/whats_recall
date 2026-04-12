import { createMemo } from "solid-js";
import { Reaction } from "../../types";

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s"']*[^\s"',.:;)]|(?<!@)\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s"']*[^\s"',.:;)])?)/gi;

export function HighlightedText(props: { text: string; query?: string }) {
  const query = createMemo(() => props.query?.trim() || "");

  const searchRegex = createMemo(() => {
    const q = query();
    if (!q) return null;
    return new RegExp(`(${q.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")})`, "gi");
  });

  const renderTextWithHighlights = (text: string) => {
    const q = query();
    const regex = searchRegex();
    if (!q || !regex) return text;
    const parts = text.split(regex);
    return parts.map((part) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark class="bg-accent/40 text-inherit rounded-sm px-0.5 border-b-2 border-accent/60">{part}</mark>
      ) : (
        part
      ),
    );
  };

  const content = createMemo(() => {
    const parts = props.text.split(URL_REGEX);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const href = part.toLowerCase().startsWith("http") ? part : `https://${part}`;
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:underline hover:text-accent/80 transition-colors break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {renderTextWithHighlights(part)}
          </a>
        );
      }
      return renderTextWithHighlights(part);
    });
  });

  return <span>{content()}</span>;
}

export function groupReactions(reactions: Reaction[]) {
  const map = new Map<
    string,
    { emoji: string; count: number; senders: string[] }
  >();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.senders.push(r.sender_name || r.sender_id);
    } else {
      map.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        senders: [r.sender_name || r.sender_id],
      });
    }
  }
  return Array.from(map.values());
}
