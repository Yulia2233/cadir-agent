import { Paperclip, Send, Square } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './IconButton';

export type ComposerMode = 'AUTO' | 'PLAN' | 'TARGET';

export function Composer({
  running,
  onSend,
  onStop,
}: {
  running: boolean;
  onSend: (content: string, mode: ComposerMode, freecad: boolean) => void | Promise<void>;
  onStop: () => void | Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<ComposerMode>('AUTO');
  const [freecad, setFreecad] = useState(false);

  const submit = async () => {
    const value = content.trim();
    if (value.length === 0 || running) return;
    await onSend(value, mode, freecad);
    setContent('');
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
          <span className="availability">Worker ready</span>
        </label>
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Describe a part, dimensions, features, or a change..."
        aria-label="CAD request"
        rows={3}
      />
      <div className="composer-actions">
        <div>
          <IconButton label="Attach image, document, STEP, or STL">
            <Paperclip size={18} />
          </IconButton>
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
