import { Archive, MoreHorizontal, PanelLeft, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ConversationSummary } from '../types';
import { IconButton } from './IconButton';

const statusLabel: Record<ConversationSummary['status'], string> = {
  IDLE: 'Idle',
  RUNNING: 'Running',
  WAITING_USER: 'Waiting',
  FAILED: 'Failed',
  COMPLETED: 'Complete',
  ARCHIVED: 'Archived',
};

export function Sidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onToggle,
  onAction,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onToggle: () => void;
  onAction: (id: string, action: 'rename' | 'archive' | 'delete') => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? conversations
      : conversations.filter((item) => item.title.toLocaleLowerCase().includes(normalized));
  }, [conversations, query]);
  const running = filtered.filter((item) => item.status === 'RUNNING');
  const history = filtered.filter((item) => item.status !== 'RUNNING');

  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div>
          <strong>CADIR</strong>
          <span>CAD workspace</span>
        </div>
        <IconButton label="Collapse conversations" onClick={onToggle}>
          <PanelLeft size={17} />
        </IconButton>
      </div>
      <button className="primary-command" onClick={onNew}>
        <Plus size={17} />
        New conversation
      </button>
      <label className="search-field">
        <Search size={16} />
        <input
          placeholder="Search conversations"
          aria-label="Search conversations"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {running.length > 0 && (
        <ConversationGroup
          title="Active"
          items={running}
          activeId={activeId}
          onSelect={onSelect}
          onAction={onAction}
        />
      )}
      <ConversationGroup
        title="History"
        items={history}
        activeId={activeId}
        onSelect={onSelect}
        onAction={onAction}
      />
      <button className="archive-link">
        <Archive size={16} />
        Archived
      </button>
    </aside>
  );
}

function ConversationGroup({
  title,
  items,
  activeId,
  onSelect,
  onAction,
}: {
  title: string;
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAction: (id: string, action: 'rename' | 'archive' | 'delete') => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <section className="conversation-group">
      <h2>{title}</h2>
      <div className="conversation-list">
        {items.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className={`conversation-row ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(item.id);
            }}
          >
            <span className="conversation-title">{item.title}</span>
            <span className={`status-dot status-${item.status.toLowerCase()}`} aria-hidden="true" />
            <span className="conversation-meta">{statusLabel[item.status]}</span>
            <div className="row-actions">
              <IconButton
                label={`Actions for ${item.title}`}
                aria-expanded={openMenu === item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenu(openMenu === item.id ? null : item.id);
                }}
              >
                <MoreHorizontal size={16} />
              </IconButton>
              {openMenu === item.id && (
                <div className="conversation-menu" role="menu">
                  {(['rename', 'archive', 'delete'] as const).map((action) => (
                    <button
                      key={action}
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction(item.id, action);
                        setOpenMenu(null);
                      }}
                    >
                      {action[0]?.toUpperCase()}
                      {action.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
