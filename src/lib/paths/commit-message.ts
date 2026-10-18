export interface CommitContext {
  path: string;
  oldPath?: string;
  newPath?: string;
  action: 'create' | 'update' | 'delete' | 'move';
  date: string;
}

export function renderCommitMessage(template: string, context: CommitContext): string {
  const fullPath = context.newPath ?? context.path;
  const values: Record<string, string> = {
    path: fullPath,
    oldPath: context.oldPath ?? context.path,
    newPath: fullPath,
    dir: fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : '',
    filename: fullPath.slice(fullPath.lastIndexOf('/') + 1),
    name: fullPath.slice(fullPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, ''),
    date: context.date,
    action: context.action,
  };

  const rendered = template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole).trim();
  return rendered || `${context.action}: ${fullPath}`;
}

export function findUnknownPlaceholders(template: string): string[] {
  const known = new Set(['path', 'oldPath', 'newPath', 'dir', 'filename', 'name', 'date', 'action']);
  const found = new Set<string>();
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    if (match[1] && !known.has(match[1])) found.add(match[1]);
  }
  return [...found];
}
