export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'picked_up'
  | 'returned'
  | 'closed'
  | 'cancelled';

const transitions: Record<BookingStatus, BookingStatus[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['picked_up', 'cancelled'],
  picked_up: ['returned'],
  returned: ['closed'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from].includes(to);
}
