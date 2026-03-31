import { Show } from "solid-js";
import { view, currentChatId } from "./store";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import Settings from "./Settings";

export default function Dashboard() {
  return (
    <div class="grid grid-cols-[340px_1fr] h-dvh relative z-1 p-3 gap-3 bg-bg max-md:flex max-md:flex-col max-md:p-0 max-md:gap-0">
      <Sidebar />
      <main 
        class="flex-1 flex flex-col bg-bg-surface/55 backdrop-blur-glass border border-white/5 rounded-lg min-w-0 h-[calc(100dvh-24px)] overflow-hidden relative shadow-inner max-md:h-dvh max-md:border-none max-md:rounded-none"
        classList={{ "max-md:hidden": !currentChatId() && view() === "chats" }}
      >
        <Show when={view() === "settings"}>
          <Settings />
        </Show>
        <Show when={view() === "chats"}>
          <ChatView />
        </Show>
      </main>
    </div>
  );
}
