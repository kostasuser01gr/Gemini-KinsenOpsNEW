import { Role, Action } from './types';

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    'fleet:read', 'fleet:write',
    'bookings:read', 'bookings:write',
    'kb:read', 'kb:write',
    'models:read', 'models:write',
    'audit:read',
    'macros:read', 'macros:write',
    'kpis:read', 'kpis:write'
  ],
  manager: [
    'fleet:read', 'fleet:write',
    'bookings:read', 'bookings:write',
    'kb:read', 'kb:write',
    'models:read',
    'macros:read', 'macros:write',
    'kpis:read'
  ],
  agent: [
    'fleet:read',
    'bookings:read', 'bookings:write',
    'kb:read',
    'macros:read'
  ]
};

export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}
