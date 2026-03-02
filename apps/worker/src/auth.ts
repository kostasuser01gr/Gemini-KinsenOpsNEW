const STEP_UP_TTL_MS = 15 * 60 * 1000;

export function extractSessionCookie(cookieHeader?: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match?.[1] || null;
}

export function isStepUpValid(lastStepUpAt?: string | null, nowMs = Date.now()): boolean {
  if (!lastStepUpAt) {
    return false;
  }

  const timestamp = new Date(lastStepUpAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return nowMs - timestamp <= STEP_UP_TTL_MS;
}
