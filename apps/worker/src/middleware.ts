import { IRequest, error } from 'itty-router';
import { Env, Action, Role } from './types';
import { PERMISSIONS } from './types';

export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

export const withCorrelationId = (req: IRequest & any) => {
  req.correlationId = req.headers.get('x-correlation-id') || ('req_' + Date.now() + Math.random().toString(36).substring(2));
};

export const withAuthAndWorkspace = async (req: IRequest & any, env: Env) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return error(401, 'Unauthorized');
  
  const session = await env.DB.prepare('SELECT user_id, last_step_up_at FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP').bind(token).first();
  if (!session) return error(401, 'Session expired or invalid');

  const user = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user) return error(401, 'User not found');
  
  req.userId = user.id as string;
  req.session = { id: token, lastStepUpAt: session.last_step_up_at };
  
  const requestedWorkspace = req.headers.get('x-workspace-id') || 'ws_default_public';
  const membership = await env.DB.prepare('SELECT role_in_workspace FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .bind(requestedWorkspace, req.userId).first();

  if (!membership) {
    if (requestedWorkspace === 'ws_default_public') {
      await env.DB.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role_in_workspace) VALUES (?, ?, ?)')
        .bind('ws_default_public', req.userId, 'agent').run();
      req.userRole = 'agent' as Role;
    } else {
      return error(403, 'Not a member of this workspace');
    }
  } else {
    req.userRole = membership.role_in_workspace as Role;
  }
  
  req.workspaceId = requestedWorkspace;
};

export const requirePermission = (action: Action) => {
  return (req: IRequest & any) => {
    if (!hasPermission(req.userRole as Role, action)) {
      return error(403, `Forbidden: requires ${action}`);
    }
  };
};

export const requireStepUp = (req: IRequest & any) => {
  if (!req.session?.lastStepUpAt) return error(403, 'Step-up authentication required');
  const lastStepUp = new Date(req.session.lastStepUpAt).getTime();
  const now = Date.now();
  if (now - lastStepUp > 15 * 60000) { // 15 minute TTL for step-up
    return error(403, 'Step-up authentication expired');
  }
};
