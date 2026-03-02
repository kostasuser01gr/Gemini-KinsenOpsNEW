import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ChatMessageDTO,
  FleetUploadTicket,
} from '@gemini/contracts';

const SESSION_STORAGE_KEY = 'ops.session_token';
const CLIENT_ID_STORAGE_KEY = 'ops.client_id';

export interface ChatSendResponse {
  response: string;
  model_id: string;
  provider: string;
  latency_ms: number;
  fallbacks: string[];
  user_message: ChatMessageDTO;
  assistant_message: ChatMessageDTO;
}

function getApiBase() {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) || window.location.origin;
}

function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

function setSessionToken(token: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
}

async function parseResponse<T>(response: Response): Promise<ApiSuccessEnvelope<T>> {
  const json = (await response.json()) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok) {
    const err = json as ApiErrorEnvelope;
    throw new Error(`${err.code}: ${err.message}`);
  }
  const success = json as ApiSuccessEnvelope<T>;
  if (!success.ok) {
    throw new Error('Unexpected API response');
  }
  return success;
}

export async function ensureSession(): Promise<string> {
  const existing = getSessionToken();
  if (existing) {
    return existing;
  }

  const clientId = getClientId();
  const identifier = `${clientId}@local.invalid`;
  const password = `pw_${clientId}_safe`;

  const base = getApiBase();
  const signupResponse = await fetch(`${base}/api/v1/auth/signup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': `web_${Date.now()}`,
    },
    credentials: 'include',
    body: JSON.stringify({ email: identifier, password }),
  });

  if (signupResponse.ok) {
    const body = await parseResponse<{ session_token?: string }>(signupResponse);
    if (body.data.session_token) {
      setSessionToken(body.data.session_token);
      return body.data.session_token;
    }
  }

  const loginResponse = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': `web_${Date.now()}`,
    },
    credentials: 'include',
    body: JSON.stringify({ identifier, password }),
  });

  const loginBody = await parseResponse<{ session_token: string }>(loginResponse);
  setSessionToken(loginBody.data.session_token);
  return loginBody.data.session_token;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { requireAuth?: boolean; correlationId?: string } = {},
): Promise<ApiSuccessEnvelope<T>> {
  const base = getApiBase();
  const headers = new Headers(init.headers || {});
  const correlationId = options.correlationId || `web_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  headers.set('x-correlation-id', correlationId);

  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json');
  }

  if (options.requireAuth !== false) {
    const token = await ensureSession();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  return parseResponse<T>(response);
}

export async function sendChatMessage(payload: {
  thread_id: string;
  content: string;
  preferred_model_id?: string;
  idempotencyKey?: string;
}): Promise<ApiSuccessEnvelope<ChatSendResponse>> {
  const headers = new Headers();
  if (payload.idempotencyKey) {
    headers.set('Idempotency-Key', payload.idempotencyKey);
  }

  return apiRequest<ChatSendResponse>('/api/v1/chat/message', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      thread_id: payload.thread_id,
      content: payload.content,
      preferred_model_id: payload.preferred_model_id,
    }),
  });
}

export async function streamChatMessage(
  payload: {
    thread_id: string;
    content: string;
    preferred_model_id?: string;
    idempotencyKey?: string;
  },
  handlers: {
    onToken: (token: string) => void;
    onDone: (meta: { model_id?: string; provider?: string; latency_ms?: number; fallbacks?: string[] }) => void;
  },
): Promise<void> {
  const token = await ensureSession();
  const base = getApiBase();
  const response = await fetch(`${base}/api/v1/chat/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(payload.idempotencyKey ? { 'Idempotency-Key': payload.idempotencyKey } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      thread_id: payload.thread_id,
      content: payload.content,
      preferred_model_id: payload.preferred_model_id,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`Stream failed: ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let doneReading = false;
  while (!doneReading) {
    const { done, value } = await reader.read();
    if (done) {
      doneReading = true;
      continue;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventChunk of events) {
      const lines = eventChunk.split('\n');
      const eventType = lines.find((line) => line.startsWith('event:'))?.replace('event:', '').trim();
      const dataLine = lines.find((line) => line.startsWith('data:'))?.replace('data:', '').trim();
      if (!dataLine) {
        continue;
      }

      const payloadData = JSON.parse(dataLine) as { token?: string; model_id?: string; provider?: string; latency_ms?: number; fallbacks?: string[] };

      if (eventType === 'token' && payloadData.token) {
        handlers.onToken(payloadData.token);
      }

      if (eventType === 'done') {
        handlers.onDone(payloadData);
      }
    }
  }
}

export async function createFleetUploadTicket(payload: {
  fleet_id: string;
  content_type: 'image/jpeg' | 'image/png' | 'image/webp';
  max_bytes?: number;
  idempotencyKey?: string;
}): Promise<ApiSuccessEnvelope<{ token: string; ticket: FleetUploadTicket }>> {
  const headers = new Headers();
  if (payload.idempotencyKey) {
    headers.set('Idempotency-Key', payload.idempotencyKey);
  }

  return apiRequest<{ token: string; ticket: FleetUploadTicket }>('/api/v1/fleet/upload-ticket', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}
