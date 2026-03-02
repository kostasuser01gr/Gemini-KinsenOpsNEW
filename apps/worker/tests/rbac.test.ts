import { describe, it, expect } from 'vitest';
import { hasPermission } from '../src/rbac';

describe('RBAC Middleware', () => {
  it('allows admin all permissions', () => {
    expect(hasPermission('admin', 'fleet:write')).toBe(true);
    expect(hasPermission('admin', 'audit:read')).toBe(true);
  });

  it('restricts agent permissions', () => {
    expect(hasPermission('agent', 'fleet:read')).toBe(true);
    expect(hasPermission('agent', 'fleet:write')).toBe(false);
    expect(hasPermission('agent', 'audit:read')).toBe(false);
  });

  it('handles manager permissions', () => {
    expect(hasPermission('manager', 'fleet:write')).toBe(true);
    expect(hasPermission('manager', 'models:write')).toBe(false);
    expect(hasPermission('manager', 'audit:read')).toBe(false);
  });
});