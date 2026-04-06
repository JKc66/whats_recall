import { Show, For, createMemo } from "solid-js";
import { Reaction } from "../../types";

export function HighlightedText(props: { text: string; query?: string }) {
  const query = createMemo(() => props.query?.trim() || "");

  const parts = createMemo(() => {
    const q = query();
    if (!q) return [props.text];
    return props.text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  });

  return (
    <Show when={query()} fallback={<span>{props.text}</span>}>
      <span>
        <For each={parts()}>
          {(part) => (
            part.toLowerCase() === query().toLowerCase()
              ? <mark class="bg-accent/40 text-inherit rounded-sm px-0.5 border-b-2 border-accent/60">{part}</mark>
              : part
          )}
        </For>
      </span>
    </Show>
  );
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
