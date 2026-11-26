import { useEffect, useState } from 'react';
import { listEvents } from '../api/api.js';

// The list arrives one page at a time. loadMore asks for the next page and adds it to the end.
// Loading is derived: if the result we hold is not for the current filters, we are loading.
export function useEvents({ q, city, onlyAvailable, sort }) {
  const key = [q, city, onlyAvailable, sort].join('|');
  const [result, setResult] = useState({ key: null, events: [], total: 0, error: '' });
  const [more, setMore] = useState({ key: null, busy: false, error: '' });

  useEffect(() => {
    let ignore = false; // a slow, older answer must not overwrite a newer one
    listEvents({ q, city, onlyAvailable, sort })
      .then(({ events, total }) => {
        if (!ignore) setResult({ key, events, total, error: '' });
      })
      .catch((err) => {
        if (!ignore) setResult({ key, events: [], total: 0, error: err.message || 'Something went wrong' });
      });
    return () => {
      ignore = true;
    };
  }, [key, q, city, onlyAvailable, sort]);

  async function loadMore() {
    const requestedFor = key;
    setMore({ key, busy: true, error: '' });
    try {
      const page = await listEvents({ q, city, onlyAvailable, sort, offset: result.events.length });
      // Filters changed while we waited? Then this page belongs to an old list: drop it.
      setResult((current) =>
        current.key === requestedFor
          ? { ...current, events: [...current.events, ...page.events], total: page.total }
          : current,
      );
      setMore({ key, busy: false, error: '' });
    } catch (err) {
      setMore({ key, busy: false, error: err.message || 'Something went wrong' });
    }
  }

  let status = 'ready';
  if (result.key !== key) status = 'loading';
  else if (result.error) status = 'error';
  else if (result.events.length === 0) status = 'empty';

  const busy = more.key === key && more.busy;
  return {
    events: result.events,
    total: result.total,
    status,
    error: result.error,
    hasMore: status === 'ready' && result.events.length < result.total,
    loadMore,
    loadingMore: busy,
    loadMoreError: more.key === key ? more.error : '',
  };
}
