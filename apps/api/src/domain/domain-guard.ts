const cadTerms = [
  'cad',
  'step',
  'stl',
  'brep',
  'model',
  'solid',
  'sketch',
  'extrude',
  'fillet',
  'chamfer',
  'hole',
  'flange',
  'bracket',
  'plate',
  '模型',
  '建模',
  '零件',
  '实体',
  '草图',
  '拉伸',
  '旋转',
  '圆角',
  '倒角',
  '孔',
  '法兰',
  '支架',
  '板',
  '尺寸',
];

const forbiddenIntent = [
  /(?:read|print|show|dump).{0,30}(?:environment|env|secret|token|password|server file)/iu,
  /(?:读取|显示|打印).{0,20}(?:环境变量|密钥|令牌|密码|服务器文件)/u,
  /(?:execute|run|invoke).{0,20}(?:shell|command|powershell|bash|cmd)/iu,
  /(?:执行|运行).{0,20}(?:系统命令|shell|powershell|bash|cmd)/iu,
  /(?:ignore|override).{0,20}(?:system|instruction|permission)/iu,
  /(?:忽略|覆盖).{0,20}(?:系统|指令|权限)/u,
];

export type GuardResult =
  | { allowed: true; category: 'cad_request' | 'current_model_modification' }
  | { allowed: false; category: 'non_cad' | 'unsafe_intent'; reason: string };

export function classifyDomainRequest(content: string, hasCurrentModel: boolean): GuardResult {
  const normalized = content.normalize('NFKC').trim().toLowerCase();
  if (forbiddenIntent.some((pattern) => pattern.test(normalized))) {
    return { allowed: false, category: 'unsafe_intent', reason: 'unsafe_capability_request' };
  }
  if (cadTerms.some((term) => normalized.includes(term))) {
    return { allowed: true, category: 'cad_request' };
  }
  if (
    hasCurrentModel &&
    /(?:change|modify|increase|decrease|add|remove|改|增加|减少|删除)/u.test(normalized)
  ) {
    return { allowed: true, category: 'current_model_modification' };
  }
  return { allowed: false, category: 'non_cad', reason: 'outside_cad_scope' };
}
