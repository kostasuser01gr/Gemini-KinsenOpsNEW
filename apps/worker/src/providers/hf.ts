import type { Env } from '../types';
import type { ChatInputMessage, Model } from '../modelRouter';

interface HFChoice {
  message?: {
    content?: string;
  };
}

interface HFResponse {
  choices?: HFChoice[];
}

export async function callHFModel(env: Env, model: Model, messages: ChatInputMessage[]): Promise<string> {
  const token = env.HF_API_TOKEN || env.HF_TOKEN;
  const res = await fetch(`https://api-inference.huggingface.co/models/${model.model_id}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model: model.model_id, messages, max_tokens: 800 }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`HF Error ${res.status}`);
  }

  const data = (await res.json()) as HFResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('HF empty completion response');
  }

  return content;
}
