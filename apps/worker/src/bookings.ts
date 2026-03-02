export type BookingStatus = 'requested' | 'confirmed' | 'picked_up' | 'returned' | 'cancelled' | 'no_show' | 'closed';

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['picked_up', 'cancelled', 'no_show'],
  picked_up: ['returned'],
  returned: ['closed'],
  cancelled: [],
  no_show: ['closed'],
  closed: []
};

export function canTransition(current: string, next: string): boolean {
  return ALLOWED_TRANSITIONS[current as BookingStatus]?.includes(next as BookingStatus) ?? false;
}
