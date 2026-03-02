import { Role, Action } from './types';

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    'fleet:read', 'fleet:write',
    'kb:read', 'kb:write',
    'models:read', 'models:write',
    'audit:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write'
  ],
  manager: [
    'fleet:read', 'fleet:write',
    'kb:read', 'kb:write',
    'models:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write'
  ],
  agent: [
    'fleet:read',
    'kb:read',
    'macros:read',
    'threads:read', 'threads:write'
  ]
};

export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}
