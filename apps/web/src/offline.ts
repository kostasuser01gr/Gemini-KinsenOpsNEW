import type { OfflineReplayResult } from '@gemini/contracts';
import { sendChatMessage } from './lib/api';
import { trackTelemetry } from './lib/telemetry';
import {
  clearOfflineOp,
  getOfflineQueue,
  queueOfflineOp,
  type OfflineQueueRecord,
  updateOfflineOp,
} from './store';

const BASE_RETRY_MS = 2000;
const MAX_RETRY_MS = 60_000;

function computeBackoffMs(retryCount: number): number {
  const raw = BASE_RETRY_MS * 2 ** retryCount;
  return Math.min(raw, MAX_RETRY_MS);
}

export async function enqueueOfflineChatMessage(payload: {
  thread_id: string;
  content: string;
  preferred_model_id?: string;
  idempotency_key: string;
}) {
  return queueOfflineOp('chat_message', payload);
}

async function replayOp(op: OfflineQueueRecord): Promise<OfflineReplayResult> {
  if (op.scope === 'chat_message') {
    const payload = op.payload as {
      thread_id?: string;
      content?: string;
      preferred_model_id?: string;
      idempotency_key?: string;
    };

    if (!payload.thread_id || !payload.content || !payload.idempotency_key) {
      return {
        op_id: op.id,
        status: 'failed',
        error_code: 'INVALID_REQUEST',
      };
    }

    try {
      await sendChatMessage({
        thread_id: payload.thread_id,
        content: payload.content,
        preferred_model_id: payload.preferred_model_id,
        idempotencyKey: payload.idempotency_key,
      });

      return {
        op_id: op.id,
        status: 'applied',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('IDEMPOTENCY_REPLAY')) {
        return {
          op_id: op.id,
          status: 'duplicate',
        };
      }

      return {
        op_id: op.id,
        status: 'failed',
        retry_after: Math.ceil(computeBackoffMs(op.retry_count + 1) / 1000),
        error_code: 'INTERNAL_ERROR',
      };
    }
  }

  return {
    op_id: op.id,
    status: 'failed',
    error_code: 'INVALID_REQUEST',
  };
}

export async function flushOfflineQueue(): Promise<OfflineReplayResult[]> {
  const queue = await getOfflineQueue();
  const results: OfflineReplayResult[] = [];

  for (const item of queue) {
    item.status = 'replaying';
    await updateOfflineOp(item);

    const result = await replayOp(item);
    results.push(result);

    if (result.status === 'applied' || result.status === 'duplicate') {
      trackTelemetry('offline.replay.applied', { op_id: item.id, status: result.status });
      await clearOfflineOp(item.id);
      continue;
    }

    trackTelemetry('offline.replay.failed', { op_id: item.id, retry_count: item.retry_count + 1 });
    item.status = 'failed';
    item.retry_count += 1;
    item.next_retry_at = Date.now() + computeBackoffMs(item.retry_count);
    await updateOfflineOp(item);
  }

  return results;
}

let syncInterval: number | null = null;

export function startOfflineSync() {
  if (syncInterval !== null) {
    return;
  }

  const tick = async () => {
    if (!navigator.onLine) {
      return;
    }
    await flushOfflineQueue();
  };

  void tick();
  syncInterval = window.setInterval(() => {
    void tick();
  }, 10_000);
}

export function stopOfflineSync() {
  if (syncInterval !== null) {
    window.clearInterval(syncInterval);
    syncInterval = null;
  }
}
