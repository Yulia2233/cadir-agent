import { Box, CheckCircle2, Download, FileCode2, WifiOff } from 'lucide-react';
import type { TimelineMessage } from '../types';

export function Timeline({
  messages,
  running,
  phaseLabel,
  streamStatus,
}: {
  messages: TimelineMessage[];
  running: boolean;
  phaseLabel: string;
  streamStatus: 'idle' | 'connected' | 'reconnecting';
}) {
  return (
    <div className="timeline" aria-live="polite">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((message) => (
          <article key={message.id} className={`message message-${message.role.toLowerCase()}`}>
            <div className="message-author">
              {message.role === 'USER' ? 'You' : message.role === 'AGENT' ? 'CADIR' : 'System'}
            </div>
            <p>{message.content}</p>
          </article>
        ))
      )}
      {running && (
        <div className="phase-row">
          <span className="spinner" />
          {phaseLabel}
        </div>
      )}
      {streamStatus === 'reconnecting' && (
        <div className="stream-warning" role="status">
          <WifiOff size={14} /> Reconnecting to task events
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Box size={28} />
      </div>
      <h2>Start a CAD model</h2>
      <p>Describe the part and include dimensions, units, and the features that matter.</p>
      <div className="artifact-strip">
        <span>
          <FileCode2 size={15} />
          Python
        </span>
        <span>
          <CheckCircle2 size={15} />
          Model JSON
        </span>
        <span>
          <Download size={15} />
          STEP / STL
        </span>
      </div>
    </div>
  );
}
