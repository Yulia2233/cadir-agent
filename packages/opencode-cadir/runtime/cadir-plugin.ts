import { tool, type Plugin } from '@opencode-ai/plugin';

const internalToken = process.env.CADIR_OPENCODE_TOOL_TOKEN;
const apiBaseUrl = process.env.CADIR_API_INTERNAL_URL ?? 'http://api:8080';

async function invoke(name: string, args: unknown, signal: AbortSignal): Promise<string> {
  if (!internalToken) throw new Error('CADIR_OPENCODE_TOOL_TOKEN is not configured');
  const response = await fetch(`${apiBaseUrl}/internal/opencode/tools/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${internalToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
    signal,
  });
  if (!response.ok) throw new Error(`CAD tool ${name} failed with status ${response.status}`);
  return JSON.stringify(await response.json());
}

export const CadirPlugin: Plugin = async () => ({
  config: async (config) => {
    config.provider = {
      ...(config.provider ?? {}),
      'cadir-provider': {
        ...(config.provider?.['cadir-provider'] ?? {}),
        options: {
          ...(config.provider?.['cadir-provider']?.options ?? {}),
          headers: {
            'x-cadir-opencode-token': internalToken ?? '',
          },
        },
      },
    };
    config.permission = {
      '*': 'deny',
      load_simplecad_skill: 'allow',
      search_model_cases: 'allow',
      get_model_case: 'allow',
      write_model: 'allow',
      read_model: 'allow',
      execute_model: 'allow',
      inspect_geometry: 'allow',
      render_model_views: 'allow',
      export_model_artifacts: 'allow',
      convert_freecad_artifacts: 'allow',
      submit_case_candidate: 'allow',
    };
  },
  'permission.ask': async (_input, output) => {
    output.status = 'deny';
  },
  'chat.headers': async (input, output) => {
    if (!internalToken) throw new Error('CADIR_OPENCODE_TOOL_TOKEN is not configured');
    output.headers['x-cadir-opencode-session'] = input.sessionID;
    output.headers['x-cadir-opencode-token'] = internalToken;
  },
  tool: {
    load_simplecad_skill: tool({
      description: 'Read a fixed SimpleCADAPI Skill or API documentation page.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        document: tool.schema.string().min(1).max(255),
      },
      execute: (args, context) => invoke('load_simplecad_skill', args, context.abort),
    }),
    write_model: tool({
      description: 'Write the complete canonical Model/model.py source for the current task.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        source: tool.schema
          .string()
          .min(1)
          .max(512 * 1024),
      },
      execute: (args, context) => invoke('write_model', args, context.abort),
    }),
    read_model: tool({
      description: 'Read model.py or canonical model.json from the current CAD workspace.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        artifact: tool.schema.enum(['model.py', 'model.json']),
      },
      execute: (args, context) => invoke('read_model', args, context.abort),
    }),
    execute_model: tool({
      description: 'Execute only the fixed Model/model.py entry in the isolated CAD Runner.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
      },
      execute: (args, context) => invoke('execute_model', args, context.abort),
    }),
    inspect_geometry: tool({
      description: 'Inspect bounded structured geometry facts without arbitrary expressions.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        entity: tool.schema.enum(['solid', 'face', 'edge']),
        index: tool.schema.number().int().nonnegative().optional(),
        fields: tool.schema
          .array(
            tool.schema.enum([
              'volume',
              'bounds',
              'area',
              'length',
              'normal',
              'center',
              'tags',
              'count',
            ]),
          )
          .min(1)
          .max(10),
      },
      execute: (args, context) => invoke('inspect_geometry', args, context.abort),
    }),
    search_model_cases: tool({
      description: 'Search only human-approved published model Cases.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        query: tool.schema.string().min(1).max(1000),
        geometryFamily: tool.schema.string().max(100).optional(),
        limit: tool.schema.number().int().min(1).max(10).default(5),
      },
      execute: (args, context) => invoke('search_model_cases', args, context.abort),
    }),
    get_model_case: tool({
      description: 'Fetch one published Case for copying into the current workspace.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        caseId: tool.schema.string().uuid(),
      },
      execute: (args, context) => invoke('get_model_case', args, context.abort),
    }),
    render_model_views: tool({
      description: 'Generate the requested fixed standard model views.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        views: tool.schema
          .array(tool.schema.enum(['iso', 'front', 'back', 'left', 'right', 'top', 'bottom']))
          .min(1)
          .max(7),
      },
      execute: (args, context) => invoke('render_model_views', args, context.abort),
    }),
    export_model_artifacts: tool({
      description: 'Export canonical fixed-name model artifacts.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
      },
      execute: (args, context) => invoke('export_model_artifacts', args, context.abort),
    }),
    convert_freecad_artifacts: tool({
      description: 'Convert a validated canonical Model JSON revision to FreeCAD outputs.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        revisionId: tool.schema.string().uuid(),
      },
      execute: (args, context) => invoke('convert_freecad_artifacts', args, context.abort),
    }),
    submit_case_candidate: tool({
      description: 'Submit an already validated revision to the private candidate pool.',
      args: {
        conversationId: tool.schema.string().uuid(),
        taskId: tool.schema.string().uuid(),
        revisionId: tool.schema.string().uuid(),
      },
      execute: (args, context) => invoke('submit_case_candidate', args, context.abort),
    }),
  },
});

export default CadirPlugin;
