export type RbacRole = 'admin' | 'manager' | 'agent';
export type RbacAction = 'fleet:read' | 'fleet:write' | 'models:write' | 'audit:read';

const permissions: Record<RbacRole, RbacAction[]> = {
  admin: ['fleet:read', 'fleet:write', 'models:write', 'audit:read'],
  manager: ['fleet:read', 'fleet:write'],
  agent: ['fleet:read'],
};

export function hasPermission(role: RbacRole, action: RbacAction): boolean {
  return permissions[role].includes(action);
}
