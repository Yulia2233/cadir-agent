import { Check, KeyRound, LoaderCircle, Plus, Server, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { ProviderConfig } from '../types';
import { IconButton } from './IconButton';

type ProviderDraft = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
};

const emptyDraft: ProviderDraft = {
  provider: 'OpenAI compatible',
  baseUrl: '',
  apiKey: '',
  modelId: '',
};

export function SettingsDialog({
  configs,
  onClose,
  onCreate,
  onDelete,
  onTest,
}: {
  configs: ProviderConfig[];
  onClose: () => void;
  onCreate: (draft: ProviderDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<'succeeded' | 'failed'>;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'succeeded' | 'failed'>>({});

  const submit = async () => {
    if (!draft.baseUrl || !draft.apiKey || !draft.modelId || creating) return;
    setCreating(true);
    try {
      await onCreate(draft);
      setDraft(emptyDraft);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="panel-kicker">User settings</span>
            <h2 id="settings-title">Model providers</h2>
          </div>
          <IconButton label="Close settings" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="settings-body">
          <section className="provider-list" aria-label="Saved model providers">
            {configs.length === 0 ? (
              <div className="settings-empty">
                <Server size={22} />
                <strong>No model provider configured</strong>
                <span>Add an OpenAI-compatible endpoint to run CAD tasks.</span>
              </div>
            ) : (
              configs.map((config) => (
                <article key={config.id} className="provider-row">
                  <div className="provider-icon">
                    <Server size={18} />
                  </div>
                  <div>
                    <strong>{config.provider}</strong>
                    <span>{config.modelId}</span>
                    <small>{config.baseUrl}</small>
                  </div>
                  {config.isDefault && <span className="default-label">Default</span>}
                  <button
                    className="secondary-command"
                    disabled={testingId === config.id}
                    onClick={() => {
                      setTestingId(config.id);
                      void onTest(config.id)
                        .then((status) =>
                          setTestResult((items) => ({ ...items, [config.id]: status })),
                        )
                        .finally(() => setTestingId(null));
                    }}
                  >
                    {testingId === config.id ? (
                      <LoaderCircle className="spin-icon" size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    {testResult[config.id] === 'failed' ? 'Retry' : 'Test'}
                  </button>
                  <IconButton
                    label={`Delete ${config.provider}`}
                    onClick={() => void onDelete(config.id)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </article>
              ))
            )}
          </section>
          <section className="provider-form">
            <h3>Add provider</h3>
            <label>
              Provider
              <input
                value={draft.provider}
                onChange={(event) => setDraft({ ...draft, provider: event.target.value })}
              />
            </label>
            <label>
              Base URL
              <input
                type="url"
                placeholder="https://provider.example/v1"
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              />
            </label>
            <label>
              Model
              <input
                placeholder="Model ID"
                value={draft.modelId}
                onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}
              />
            </label>
            <label>
              API key
              <span className="secret-input">
                <KeyRound size={15} />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter or replace key"
                  value={draft.apiKey}
                  onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                />
              </span>
            </label>
            <button className="primary-command" disabled={creating} onClick={() => void submit()}>
              {creating ? <LoaderCircle className="spin-icon" size={16} /> : <Plus size={16} />}
              Add provider
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
