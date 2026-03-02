import type { Env } from '../types';
import type { ChatInputMessage, Model } from '../modelRouter';

export async function callCFModel(env: Env, model: Model, messages: ChatInputMessage[]): Promise<string> {
  if (!env.AI) {
    throw new Error('AI not bound');
  }

  const res = await env.AI.run(model.model_id, { messages, max_tokens: 800 });
  const content = res.response || res.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('CF Workers AI empty completion response');
  }

  return content;
}
