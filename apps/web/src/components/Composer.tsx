import { FileUp, Paperclip, Send, Square, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { SelectionContext, TaskMode, UploadDraft } from '../types';
import { IconButton } from './IconButton';

export function Composer({
  running,
  freecadReady,
  selections,
  onSend,
  onStop,
  onRemoveSelection,
}: {
  running: boolean;
  freecadReady: boolean;
  selections: SelectionContext[];
  onSend: (
    content: string,
    mode: TaskMode,
    freecad: boolean,
    attachments: UploadDraft[],
  ) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onRemoveSelection: (id: string) => void;
}) {
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<TaskMode>('AUTO');
  const [freecad, setFreecad] = useState(false);
  const [attachments, setAttachments] = useState<UploadDraft[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const value = content.trim();
    if (value.length === 0 || running) return;
    await onSend(value, mode, freecad, attachments);
    setContent('');
    setAttachments([]);
  };

  return (
    <div className="composer">
      <div className="composer-controls">
        <div className="segmented" aria-label="Task mode">
          {(['AUTO', 'PLAN', 'TARGET'] as const).map((value) => (
            <button
              key={value}
              className={mode === value ? 'selected' : ''}
              onClick={() => setMode(value)}
            >
              {value === 'AUTO' ? 'Auto' : value === 'PLAN' ? 'Plan' : 'Target'}
            </button>
          ))}
        </div>
        <label className="toggle-row">
          <input
            aria-label="FreeCAD"
            type="checkbox"
            checked={freecad}
            onChange={(event) => setFreecad(event.target.checked)}
          />
          <span>FreeCAD</span>
          <span className={freecadReady ? 'availability' : 'availability unavailable'}>
            {freecadReady ? 'Worker ready' : 'Worker unavailable'}
          </span>
        </label>
      </div>
      {(selections.length > 0 || attachments.length > 0) && (
        <div className="composer-context" aria-label="Request context">
          {selections.map((selection) => (
            <span
              key={selection.id}
              className={`context-chip status-${selection.status.toLowerCase()}`}
            >
              {selection.summary}
              <button
                aria-label={`Remove ${selection.displayId}`}
                onClick={() => onRemoveSelection(selection.id)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {attachments.map((attachment) => (
            <span key={attachment.id} className="context-chip">
              <FileUp size={13} /> {attachment.name}
              <button
                aria-label={`Remove ${attachment.name}`}
                onClick={() =>
                  setAttachments((items) => items.filter((item) => item.id !== attachment.id))
                }
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
        maxLength={40_000}
        placeholder="Describe a part, dimensions, features, or a change..."
        aria-label="CAD request"
        rows={3}
      />
      <div className="composer-actions">
        <div>
          <IconButton
            label="Attach image, document, STEP, or STL"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={18} />
          </IconButton>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            multiple
            accept="image/*,.pdf,.docx,.step,.stp,.stl"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setAttachments((items) => [
                ...items,
                ...files.map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  name: file.name,
                  size: file.size,
                  status: 'ready' as const,
                })),
              ]);
              event.target.value = '';
            }}
          />
          <span className="core-output">SimpleCAD outputs included</span>
        </div>
        {running ? (
          <button className="stop-command" onClick={() => void onStop()}>
            <Square size={15} />
            Stop
          </button>
        ) : (
          <button
            className="send-command"
            disabled={content.trim().length === 0}
            onClick={() => void submit()}
          >
            <Send size={16} />
            Send
          </button>
        )}
      </div>
    </div>
  );
}
