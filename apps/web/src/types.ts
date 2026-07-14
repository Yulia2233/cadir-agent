export type ConversationSummary = {
  id: string;
  title: string;
  status: 'IDLE' | 'RUNNING' | 'WAITING_USER' | 'FAILED' | 'COMPLETED' | 'ARCHIVED';
  updatedAt: string;
  currentRevisionId: string | null;
};

export type TimelineMessage = {
  id: string;
  role: 'USER' | 'AGENT' | 'SYSTEM';
  content: string;
  createdAt: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'REVIEWER' | 'ADMIN';
};

export type ProviderConfig = {
  id: string;
  provider: string;
  baseUrl: string;
  modelId: string;
  isDefault: boolean;
  apiKeyConfigured: boolean;
};

export type TaskMode = 'AUTO' | 'PLAN' | 'TARGET';

export type TaskPhase =
  | 'DOMAIN_GUARD'
  | 'ANALYZE'
  | 'WAITING_USER'
  | 'RETRIEVE'
  | 'PLAN'
  | 'CODE'
  | 'EXECUTE'
  | 'VALIDATE'
  | 'VISUAL_REVIEW'
  | 'PUBLISH'
  | 'CASE_PACKAGE'
  | 'CASE_CANDIDATE'
  | 'REJECTED'
  | 'NEEDS_USER'
  | 'FAILED'
  | 'COMPLETED';

export type CadirEvent = {
  event_id: string;
  conversation_id: string;
  task_id: string | null;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type UploadDraft = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'ready' | 'uploading' | 'failed';
};

export type SelectionContext = {
  id: string;
  revisionId: string;
  entityType: 'face' | 'edge';
  displayId: string;
  topologyRef: string;
  summary: string;
  status: 'ACTIVE' | 'RECOVERED' | 'AMBIGUOUS' | 'INVALID';
};
