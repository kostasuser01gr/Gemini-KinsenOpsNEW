import { describe, it, expect } from 'vitest';
import { canTransition } from '../src/bookings';

describe('Booking State Machine', () => {
  it('allows valid transitions', () => {
    expect(canTransition('requested', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'picked_up')).toBe(true);
    expect(canTransition('picked_up', 'returned')).toBe(true);
    expect(canTransition('returned', 'closed')).toBe(true);
  });

  it('prevents invalid transitions', () => {
    expect(canTransition('requested', 'returned')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('picked_up', 'confirmed')).toBe(false);
  });
});