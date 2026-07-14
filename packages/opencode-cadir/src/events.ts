const eventMap: Record<string, string> = {
  'session.message.delta': 'agent.message.delta',
  'session.message.completed': 'agent.message.completed',
  'tool.skill.started': 'skill.loading',
  'tool.skill.completed': 'skill.loaded',
  'tool.write.started': 'code.writing',
  'tool.write.completed': 'code.written',
  'tool.execute.started': 'model.execution.started',
  'tool.execute.completed': 'model.execution.completed',
  'tool.execute.failed': 'model.execution.failed',
};

export function mapOpenCodeEvent(type: string): string | null {
  return eventMap[type] ?? null;
}
