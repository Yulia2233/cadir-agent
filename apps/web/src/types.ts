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
