import { Menu, Settings, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, ApiError, openEventStream, setCsrfToken } from './api/client';
import { Composer } from './components/Composer';
import { IconButton } from './components/IconButton';
import { ModelPanel } from './components/ModelPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { UserMenu } from './components/UserMenu';
import { useColorScheme } from './hooks/useColorScheme';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useWorkbench } from './state/workbench';
import type {
  CadirEvent,
  ConversationSummary,
  ProviderConfig,
  SelectionContext,
  TaskMode,
  TaskPhase,
  TimelineMessage,
  UploadDraft,
  UserProfile,
} from './types';

const localConversation: ConversationSummary = {
  id: 'local-1',
  title: 'New CAD conversation',
  status: 'IDLE',
  updatedAt: new Date().toISOString(),
  currentRevisionId: null,
};

const phaseLabels: Record<TaskPhase, string> = {
  DOMAIN_GUARD: 'Checking CAD request scope',
  ANALYZE: 'Analyzing requirements',
  WAITING_USER: 'Waiting for required dimensions',
  RETRIEVE: 'Searching similar model Cases',
  PLAN: 'Planning modeling steps',
  CODE: 'Writing Model/model.py',
  EXECUTE: 'Executing model',
  VALIDATE: 'Validating geometry',
  VISUAL_REVIEW: 'Generating standard views',
  PUBLISH: 'Generating download files',
  CASE_PACKAGE: 'Packaging model Case candidate',
  CASE_CANDIDATE: 'Submitting model Case candidate',
  REJECTED: 'Request is outside CAD scope',
  NEEDS_USER: 'More information is needed',
  FAILED: 'Task failed',
  COMPLETED: 'Task completed',
};

type ConversationPage = {
  items: Array<ConversationSummary & { updatedAt: string }>;
  nextCursor: string | null;
};
type MessagePage = {
  items: Array<{
    id: string;
    role: 'USER' | 'AGENT' | 'SYSTEM';
    content: string;
    createdAt: string;
  }>;
  nextCursor: string | null;
};

export function App() {
  const workbench = useWorkbench();
  const { preference, resolved, setPreference } = useColorScheme();
  const [conversations, setConversations] = useLocalStorageState<ConversationSummary[]>(
    'cadir.local.conversations',
    [localConversation],
  );
  const [messagesByConversation, setMessagesByConversation] = useLocalStorageState<
    Record<string, TimelineMessage[]>
  >('cadir.local.messages', {});
  const [user, setUser] = useState<UserProfile | null>(null);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<TaskPhase>('DOMAIN_GUARD');
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connected' | 'reconnecting'>('idle');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<SelectionContext[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const active = useMemo(
    () =>
      conversations.find((item) => item.id === workbench.activeConversationId) ?? conversations[0],
    [conversations, workbench.activeConversationId],
  );
  const messages = active === undefined ? [] : (messagesByConversation[active.id] ?? []);

  const updateConversation = useCallback(
    (id: string, patch: Partial<ConversationSummary>) => {
      setConversations((items) =>
        items.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
        ),
      );
    },
    [setConversations],
  );

  const loadConfigs = useCallback(async () => {
    try {
      const response = await apiRequest<{ items: ProviderConfig[] }>('/api/me/model-configs');
      setConfigs(response.items);
    } catch {
      setConfigs([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestControllerRef.current = controller;
    void Promise.all([
      apiRequest<{ user: UserProfile }>('/api/me', { signal: controller.signal }),
      apiRequest<ConversationPage>('/api/conversations?limit=50', { signal: controller.signal }),
    ])
      .then(([me, page]) => {
        setUser(me.user);
        setOfflineMode(false);
        if (page.items.length > 0) {
          setConversations(page.items);
          workbench.setActiveConversation(page.items[0]?.id ?? null);
        }
        void loadConfigs();
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setOfflineMode(true);
      });
    return () => controller.abort();
  }, [loadConfigs, setConversations, workbench]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (conversationId.startsWith('local-')) return;
      const controller = new AbortController();
      requestControllerRef.current?.abort();
      requestControllerRef.current = controller;
      try {
        const page = await apiRequest<MessagePage>(
          `/api/conversations/${conversationId}/messages?limit=100`,
          { signal: controller.signal },
        );
        setMessagesByConversation((items) => ({
          ...items,
          [conversationId]: page.items,
        }));
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setOfflineMode(true);
      }
    },
    [setMessagesByConversation],
  );

  const handleEvent = useCallback(
    (event: MessageEvent<string>) => {
      let parsed: CadirEvent;
      try {
        parsed = JSON.parse(event.data) as CadirEvent;
      } catch {
        return;
      }
      setStreamStatus('connected');
      if (parsed.type === 'task.phase.changed') {
        const nextPhase = parsed.data.phase;
        if (typeof nextPhase === 'string' && nextPhase in phaseLabels) {
          setPhase(nextPhase as TaskPhase);
          setRunning(!['COMPLETED', 'FAILED', 'NEEDS_USER', 'REJECTED'].includes(nextPhase));
        }
      }
      if (parsed.type === 'conversation.title.updated' && typeof parsed.data.title === 'string') {
        updateConversation(parsed.conversation_id, { title: parsed.data.title });
      }
      if (parsed.type === 'task.completed' || parsed.type === 'task.aborted') {
        setRunning(false);
        setPhase('COMPLETED');
        updateConversation(parsed.conversation_id, { status: 'COMPLETED' });
        void loadMessages(parsed.conversation_id);
      }
      if (parsed.type === 'task.failed') {
        setRunning(false);
        setPhase('FAILED');
        updateConversation(parsed.conversation_id, { status: 'FAILED' });
      }
    },
    [loadMessages, updateConversation],
  );

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (active === undefined || active.id.startsWith('local-') || offlineMode) {
      setStreamStatus('idle');
      return;
    }
    const source = openEventStream(active.id, handleEvent);
    eventSourceRef.current = source;
    source.onopen = () => setStreamStatus('connected');
    source.onerror = () => setStreamStatus('reconnecting');
    return () => source.close();
  }, [active, handleEvent, offlineMode]);

  const appendMessage = (conversationId: string, message: TimelineMessage) => {
    setMessagesByConversation((items) => ({
      ...items,
      [conversationId]: [...(items[conversationId] ?? []), message],
    }));
  };

  const send = async (
    content: string,
    mode: TaskMode,
    freecad: boolean,
    attachments: UploadDraft[],
  ) => {
    if (active === undefined) return;
    setError(null);
    const optimistic: TimelineMessage = {
      id: crypto.randomUUID(),
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    appendMessage(active.id, optimistic);
    updateConversation(active.id, {
      title: active.title === 'New CAD conversation' ? content.slice(0, 48) : active.title,
      status: 'RUNNING',
    });
    setRunning(true);
    setPhase('DOMAIN_GUARD');

    if (offlineMode || active.id.startsWith('local-')) return;
    try {
      await apiRequest(`/api/conversations/${active.id}/messages`, {
        method: 'POST',
        headers: { 'x-idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          content,
          mode,
          freecadRequested: freecad,
          selections: selections.map((selection) => selection.id),
          attachments: attachments.map((attachment) => attachment.id),
        }),
      });
    } catch (caught) {
      setRunning(false);
      updateConversation(active.id, { status: 'FAILED' });
      setError(caught instanceof ApiError ? caught.message : 'The request could not be sent.');
    }
  };

  const stop = async () => {
    if (active === undefined) return;
    setRunning(false);
    updateConversation(active.id, { status: 'IDLE' });
    if (!offlineMode && !active.id.startsWith('local-')) {
      await apiRequest(`/api/conversations/${active.id}/abort`, { method: 'POST' }).catch(
        () => undefined,
      );
    }
  };

  const newConversation = async () => {
    let conversation: ConversationSummary = {
      ...localConversation,
      id: `local-${crypto.randomUUID()}`,
      updatedAt: new Date().toISOString(),
    };
    if (!offlineMode) {
      try {
        conversation = await apiRequest<ConversationSummary>('/api/conversations', {
          method: 'POST',
        });
      } catch {
        setOfflineMode(true);
      }
    }
    setConversations((items) => [conversation, ...items]);
    workbench.setActiveConversation(conversation.id);
  };

  const selectConversation = (id: string) => {
    requestControllerRef.current?.abort();
    workbench.setActiveConversation(id);
    setSelections([]);
    setError(null);
    void loadMessages(id);
  };

  const conversationAction = async (id: string, action: 'rename' | 'archive' | 'delete') => {
    if (action === 'rename') {
      const current = conversations.find((item) => item.id === id);
      const title = window.prompt('Conversation title', current?.title ?? '');
      if (title === null || title.trim().length === 0) return;
      updateConversation(id, { title: title.trim() });
      if (!offlineMode && !id.startsWith('local-')) {
        await apiRequest(`/api/conversations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: title.trim() }),
        }).catch(() => setError('The conversation could not be renamed.'));
      }
      return;
    }
    if (
      action === 'delete' &&
      !window.confirm('Delete this conversation and its private workspace?')
    )
      return;
    if (action === 'archive') updateConversation(id, { status: 'ARCHIVED' });
    else {
      setConversations((items) => items.filter((item) => item.id !== id));
      workbench.setActiveConversation(conversations.find((item) => item.id !== id)?.id ?? null);
    }
    if (!offlineMode && !id.startsWith('local-')) {
      const request =
        action === 'archive'
          ? apiRequest(`/api/conversations/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ archived: true }),
            })
          : apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
      await request.catch(() => setError(`The conversation could not be ${action}d.`));
    }
  };

  const createConfig = async (draft: {
    provider: string;
    baseUrl: string;
    apiKey: string;
    modelId: string;
  }) => {
    const config = await apiRequest<ProviderConfig>('/api/me/model-configs', {
      method: 'POST',
      body: JSON.stringify({ ...draft, isDefault: configs.length === 0 }),
    });
    setConfigs((items) => [...items, config]);
  };

  const logout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    window.location.reload();
  };

  return (
    <div className={`app-shell theme-${resolved} ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {sidebarOpen && (
        <Sidebar
          conversations={conversations.filter((item) => item.status !== 'ARCHIVED')}
          activeId={active?.id ?? null}
          onNew={() => void newConversation()}
          onSelect={selectConversation}
          onToggle={() => setSidebarOpen(false)}
          onAction={(id, action) => void conversationAction(id, action)}
        />
      )}
      <main className={`chat-panel mobile-${workbench.mobilePanel}`}>
        <header className="chat-header">
          <div className="chat-heading">
            {!sidebarOpen && (
              <IconButton label="Open conversations" onClick={() => setSidebarOpen(true)}>
                <Menu size={18} />
              </IconButton>
            )}
            <div>
              <h1>{active?.title ?? 'CAD workspace'}</h1>
              <span className={running ? 'task-running' : ''}>
                {offlineMode ? 'Local draft' : running ? phaseLabels[phase] : 'Ready'}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <div className="mobile-tabs" aria-label="Workspace view">
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
            <IconButton label="Provider settings" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </IconButton>
            <div className="user-menu-wrap">
              <IconButton
                label="User menu"
                className="user-button"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                <UserRound size={18} />
              </IconButton>
              {userMenuOpen && (
                <UserMenu
                  user={user}
                  theme={preference}
                  onTheme={setPreference}
                  onSettings={() => {
                    setUserMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  onLogout={() => void logout()}
                />
              )}
            </div>
          </div>
        </header>
        <section className="chat-content">
          {error !== null && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}
          <Timeline
            messages={messages}
            running={running}
            phaseLabel={phaseLabels[phase]}
            streamStatus={streamStatus}
          />
          <Composer
            running={running}
            freecadReady={!offlineMode}
            selections={selections}
            onSend={send}
            onStop={stop}
            onRemoveSelection={(id) =>
              setSelections((items) => items.filter((item) => item.id !== id))
            }
          />
        </section>
      </main>
      <ModelPanel selectionMode={workbench.selectionMode} onMode={workbench.setSelectionMode} />
      {settingsOpen && (
        <SettingsDialog
          configs={configs}
          onClose={() => setSettingsOpen(false)}
          onCreate={createConfig}
          onDelete={async (id) => {
            await apiRequest(`/api/me/model-configs/${id}`, { method: 'DELETE' });
            setConfigs((items) => items.filter((item) => item.id !== id));
          }}
          onTest={async (id) => {
            const result = await apiRequest<{ status: 'succeeded' | 'failed' }>(
              `/api/me/model-configs/${id}/test`,
              { method: 'POST' },
            );
            return result.status;
          }}
        />
      )}
    </div>
  );
}
