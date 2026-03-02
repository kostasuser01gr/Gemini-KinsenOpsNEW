import { describe, expect, it } from 'vitest';
import { Model, prioritizePreferredModel, selectEligibleModels } from '../src/modelRouter';

const baseModel: Model = {
  id: 'm1',
  display_name: 'Model 1',
  provider_kind: 'HF_ROUTED_FREE',
  model_id: 'provider/m1',
  enabled: 1,
  priority: 10,
  free_policy: 'FREE_ONLY',
  health_status: 'healthy',
};

describe('model router selection helpers', () => {
  it('filters non-free models in strict mode', () => {
    const candidates: Model[] = [
      baseModel,
      { ...baseModel, id: 'm2', model_id: 'provider/m2', free_policy: 'PAID_ALLOWED' },
    ];

    const eligible = selectEligibleModels(candidates, true, new Date().toISOString(), 'thread-1');
    expect(eligible.map((m) => m.id)).toEqual(['m1']);
  });

  it('moves preferred model to the front', () => {
    const models: Model[] = [
      { ...baseModel, id: 'm1' },
      { ...baseModel, id: 'm2', model_id: 'provider/m2' },
      { ...baseModel, id: 'm3', model_id: 'provider/m3' },
    ];

    const prioritized = prioritizePreferredModel(models, 'm3');
    expect(prioritized[0].id).toBe('m3');
    expect(prioritized).toHaveLength(3);
  });
});
