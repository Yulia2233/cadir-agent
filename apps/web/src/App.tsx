import { Moon, PanelLeftClose, Settings, Sun, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Composer } from './components/Composer';
import { IconButton } from './components/IconButton';
import { ModelPanel } from './components/ModelPanel';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { useWorkbench } from './state/workbench';
import type { ConversationSummary, TimelineMessage } from './types';

const initialConversations: ConversationSummary[] = [
  {
    id: 'local-1',
    title: 'New CAD conversation',
    status: 'IDLE',
    updatedAt: new Date().toISOString(),
    currentRevisionId: null,
  },
];

export function App() {
  const workbench = useWorkbench();
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const active = useMemo(
    () =>
      conversations.find((item) => item.id === workbench.activeConversationId) ?? conversations[0],
    [conversations, workbench.activeConversationId],
  );

  const send = (content: string) => {
    if (active === undefined) return;
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: 'USER', content, createdAt: new Date().toISOString() },
    ]);
    setConversations((items) =>
      items.map((item) =>
        item.id === active.id
          ? {
              ...item,
              title: item.title === 'New CAD conversation' ? content.slice(0, 48) : item.title,
              status: 'RUNNING',
            }
          : item,
      ),
    );
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setConversations((items) =>
      items.map((item) => (item.id === active?.id ? { ...item, status: 'IDLE' } : item)),
    );
  };
  const newConversation = () => {
    const id = crypto.randomUUID();
    setConversations((items) => [
      {
        id,
        title: 'New CAD conversation',
        status: 'IDLE',
        updatedAt: new Date().toISOString(),
        currentRevisionId: null,
      },
      ...items,
    ]);
    workbench.setActiveConversation(id);
    setMessages([]);
  };

  return (
    <div className={`app-shell theme-${theme}`}>
      <Sidebar
        conversations={conversations}
        activeId={active?.id ?? null}
        onNew={newConversation}
        onSelect={workbench.setActiveConversation}
      />
      <main className={`chat-panel mobile-${workbench.mobilePanel}`}>
        <header className="chat-header">
          <div className="chat-heading">
            <IconButton label="Collapse conversations">
              <PanelLeftClose size={18} />
            </IconButton>
            <div>
              <h1>{active?.title ?? 'CAD workspace'}</h1>
              <span className={running ? 'task-running' : ''}>{running ? 'Running' : 'Ready'}</span>
            </div>
          </div>
          <div className="header-actions">
            <div className="mobile-tabs">
              <button
                className={workbench.mobilePanel === 'chat' ? 'active' : ''}
                onClick={() => workbench.setMobilePanel('chat')}
              >
                Chat
              </button>
              <button
                className={workbench.mobilePanel === 'model' ? 'active' : ''}
                onClick={() => workbench.setMobilePanel('model')}
              >
                Model
              </button>
            </div>
            <IconButton
              label="Toggle theme"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>
            <IconButton label="Settings">
              <Settings size={18} />
            </IconButton>
            <IconButton label="User menu" className="user-button">
              <UserRound size={18} />
            </IconButton>
          </div>
        </header>
        <section className="chat-content">
          <Timeline messages={messages} running={running} />
          <Composer running={running} onSend={send} onStop={stop} />
        </section>
      </main>
      <ModelPanel selectionMode={workbench.selectionMode} onMode={workbench.setSelectionMode} />
    </div>
  );
}
