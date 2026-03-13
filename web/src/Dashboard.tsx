import { Show } from 'solid-js';
import { view, toasts, removeToast } from './store';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import Settings from './Settings';

export default function Dashboard() {
  return (
    <div class="app">
      <Sidebar />
      <main class="chat-panel">
        <Show when={view() === 'settings'}>
          <Settings />
        </Show>
        <Show when={view() === 'chats'}>
          <ChatView />
        </Show>
      </main>

      <div class="toast-container">
        {toasts().map((t) => (
          <div class="toast" onClick={() => removeToast(t.id)}>
            <div class="toast-title">{t.title}</div>
            <div class="toast-body">{t.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
