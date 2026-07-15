import {
  Check,
  KeyRound,
  ListRestart,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Server,
  Star,
  Trash2,
  X,
} from 'lucide-react';
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
  // Keep the supplied OpenAI-compatible gateway ready for first-run setup.
  baseUrl: 'https://vip.auto-code.net/v1',
  apiKey: '',
  // Match the stable model alias configured by the internal OpenCode agent.
  modelId: '5.6-sol',
};

export function SettingsDialog({
  configs,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  onLoadModels,
}: {
  configs: ProviderConfig[];
  onClose: () => void;
  onCreate: (draft: ProviderDraft) => Promise<void>;
  onUpdate: (id: string, draft: Partial<ProviderDraft> & { isDefault?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<'succeeded' | 'failed'>;
  onLoadModels: (id: string) => Promise<string[]>;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'succeeded' | 'failed'>>({});
  const [models, setModels] = useState<string[]>([]);
  const [loadingModelsId, setLoadingModelsId] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.baseUrl || !draft.modelId || (editingId === null && !draft.apiKey) || creating)
      return;
    setCreating(true);
    try {
      if (editingId === null) await onCreate(draft);
      else {
        await onUpdate(editingId, {
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          modelId: draft.modelId,
          ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
        });
      }
      setDraft(emptyDraft);
      setEditingId(null);
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
                  {!config.isDefault && (
                    <button
                      className="secondary-command"
                      title="Set as default provider"
                      onClick={() => void onUpdate(config.id, { isDefault: true })}
                    >
                      <Star size={15} />
                      Default
                    </button>
                  )}
                  <button
                    className="secondary-command"
                    title="Edit provider"
                    onClick={() => {
                      setEditingId(config.id);
                      setDraft({
                        provider: config.provider,
                        baseUrl: config.baseUrl,
                        modelId: config.modelId,
                        apiKey: '',
                      });
                    }}
                  >
                    <Pencil size={15} />
                    Edit
                  </button>
                  <button
                    className="secondary-command"
                    title="Load available models"
                    disabled={loadingModelsId === config.id}
                    onClick={() => {
                      setLoadingModelsId(config.id);
                      void onLoadModels(config.id)
                        .then((items) => {
                          setModels(items);
                          setEditingId(config.id);
                          setDraft({
                            provider: config.provider,
                            baseUrl: config.baseUrl,
                            modelId: config.modelId,
                            apiKey: '',
                          });
                        })
                        .finally(() => setLoadingModelsId(null));
                    }}
                  >
                    {loadingModelsId === config.id ? (
                      <LoaderCircle className="spin-icon" size={15} />
                    ) : (
                      <ListRestart size={15} />
                    )}
                    Models
                  </button>
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
                    {testResult[config.id] === 'succeeded'
                      ? 'Connected'
                      : testResult[config.id] === 'failed'
                        ? 'Retry'
                        : 'Test'}
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
            <h3>{editingId === null ? 'Add provider' : 'Edit provider'}</h3>
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
                placeholder="https://vip.auto-code.net/v1"
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              />
            </label>
            <label>
              Model
              <input
                list="provider-models"
                placeholder="Model ID"
                value={draft.modelId}
                onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}
              />
              <datalist id="provider-models">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label>
              API key
              <span className="secret-input">
                <KeyRound size={15} />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    editingId === null ? 'Enter API key' : 'Leave blank to keep current key'
                  }
                  value={draft.apiKey}
                  onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                />
              </span>
            </label>
            <button className="primary-command" disabled={creating} onClick={() => void submit()}>
              {creating ? (
                <LoaderCircle className="spin-icon" size={16} />
              ) : editingId === null ? (
                <Plus size={16} />
              ) : (
                <Save size={16} />
              )}
              {editingId === null ? 'Add provider' : 'Save provider'}
            </button>
            {editingId !== null && (
              <button
                className="secondary-command"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft);
                }}
              >
                <X size={15} />
                Cancel edit
              </button>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
