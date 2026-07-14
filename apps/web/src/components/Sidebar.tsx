import { Archive, MoreHorizontal, Plus, Search } from 'lucide-react';
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
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const running = conversations.filter((item) => item.status === 'RUNNING');
  const history = conversations.filter((item) => item.status !== 'RUNNING');

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
      </div>
      <button className="primary-command" onClick={onNew}>
        <Plus size={17} />
        New conversation
      </button>
      <label className="search-field">
        <Search size={16} />
        <input placeholder="Search conversations" aria-label="Search conversations" />
      </label>
      {running.length > 0 && (
        <ConversationGroup title="Active" items={running} activeId={activeId} onSelect={onSelect} />
      )}
      <ConversationGroup title="History" items={history} activeId={activeId} onSelect={onSelect} />
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
}: {
  title: string;
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
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
            <IconButton
              label={`Actions for ${item.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </section>
  );
}
