import { describe, it, expect } from 'vitest';
import { calculateQuote, QuoteRequest, PricingRule } from '../src/pricing';

describe('Pricing Engine', () => {
  it('calculates base price correctly', () => {
    const req: QuoteRequest = {
      startAt: '2026-03-05T10:00:00Z',
      endAt: '2026-03-07T10:00:00Z', // 2 days
      basePriceDay: 50,
      deposit: 200,
      locationId: 'loc_1',
      vehicleClass: 'compact'
    };
    
    const rules: PricingRule[] = [];
    const res = calculateQuote(req, rules);
    
    expect(res.days).toBe(2);
    expect(res.baseTotal).toBe(100);
    expect(res.total).toBe(100);
  });

  it('applies percentage discount and fixed addon', () => {
    const req: QuoteRequest = {
      startAt: '2026-03-05T10:00:00Z',
      endAt: '2026-03-08T10:00:00Z', // 3 days
      basePriceDay: 100, // base = 300
      deposit: 200,
      locationId: 'loc_1',
      vehicleClass: 'suv',
      addOns: ['insurance_basic']
    };
    
    const rules: PricingRule[] = [
      {
        id: 'r_1', name: '10% off SUV', priority: 10,
        rule_json: JSON.stringify({
          type: 'discount', valueType: 'percentage', value: 10,
          conditions: { vehicleClass: 'suv' }
        })
      },
      {
        id: 'r_2', name: 'Basic Insurance', priority: 5,
        rule_json: JSON.stringify({
          type: 'addon', valueType: 'fixed', value: 15,
          conditions: { addOnId: 'insurance_basic' }
        })
      }
    ];

    const res = calculateQuote(req, rules);
    
    expect(res.baseTotal).toBe(300);
    expect(res.discounts).toBe(30); // 10% of 300
    expect(res.addOnsTotal).toBe(45); // 15 * 3 days
    expect(res.total).toBe(300 - 30 + 45); // 315
  });
});