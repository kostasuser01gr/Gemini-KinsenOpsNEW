import type { ChatInputMessage, Model } from '../modelRouter';

export async function callMockModel(model: Model, messages: ChatInputMessage[]): Promise<string> {
  const latest = messages[messages.length - 1]?.content || '';
  return `Mock(${model.model_id}): ${latest}`;
}
