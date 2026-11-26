import { useEffect, useState } from 'react';
import { listMyBookings } from '../api/api.js';

// loading -> ready | empty | error, same pattern as useEvents.
export function useMyBookings() {
  const [state, setState] = useState({ bookings: [], status: 'loading', error: '' });

  useEffect(() => {
    let cancelled = false;
    listMyBookings()
      .then(({ bookings }) => {
        if (!cancelled) setState({ bookings, status: bookings.length ? 'ready' : 'empty', error: '' });
      })
      .catch((err) => {
        if (!cancelled) setState({ bookings: [], status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
