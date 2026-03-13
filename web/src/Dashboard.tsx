import { Show } from 'solid-js';
import { view } from './store';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import Settings from './Settings';

export default function Dashboard() {
  return (
    <div class="app">
      <Sidebar />
      <main class="main-panel">
        <Show when={view() === 'settings'}>
          <Settings />
        </Show>
        <Show when={view() === 'chats'}>
          <ChatView />
        </Show>
      </main>
    </div>
  );
}
