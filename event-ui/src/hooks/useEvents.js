import { useEffect, useState } from 'react';
import { listEvents } from '../api/api.js';

// Loading is derived: if the result we hold is not for the current filters, we are loading.
export function useEvents({ q, city, onlyAvailable, sort }) {
  const key = [q, city, onlyAvailable, sort].join('|');
  const [result, setResult] = useState({ key: null, events: [], error: '' });

  useEffect(() => {
    let ignore = false; // a slow, older answer must not overwrite a newer one
    listEvents({ q, city, onlyAvailable, sort })
      .then(({ events }) => {
        if (!ignore) setResult({ key, events, error: '' });
      })
      .catch((err) => {
        if (!ignore) setResult({ key, events: [], error: err.message || 'Something went wrong' });
      });
    return () => {
      ignore = true;
    };
  }, [key, q, city, onlyAvailable, sort]);

  let status = 'ready';
  if (result.key !== key) status = 'loading';
  else if (result.error) status = 'error';
  else if (result.events.length === 0) status = 'empty';

  return { events: result.events, status, error: result.error };
}
