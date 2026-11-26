import { useEffect, useState } from 'react';

// Seconds left until holdUntil. We count to a fixed time, never "minus one per tick".
export function useCountdown(holdUntil) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id); // stop the timer when the component leaves
  }, []);

  return Math.max(0, Math.ceil((new Date(holdUntil).getTime() - now) / 1000));
}
