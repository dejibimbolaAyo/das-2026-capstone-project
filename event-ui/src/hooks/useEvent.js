import { useEffect, useState } from 'react';
import { getEvent } from '../api/api.js';

export function useEvent(id) {
  const [result, setResult] = useState({ id: null, event: null, error: null });

  useEffect(() => {
    let ignore = false;
    getEvent(id)
      .then((event) => {
        if (!ignore) setResult({ id, event, error: null });
      })
      .catch((error) => {
        if (!ignore) setResult({ id, event: null, error });
      });
    return () => {
      ignore = true;
    };
  }, [id]);

  let status = 'ready';
  if (result.id !== id) status = 'loading';
  else if (result.error) status = result.error.status === 404 ? 'notfound' : 'error';

  return { event: result.event, status };
}
