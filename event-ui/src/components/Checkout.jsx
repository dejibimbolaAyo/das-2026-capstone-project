import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { pay } from '../api/api.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { formatCountdown, formatMoney } from '../lib/format.js';

export default function Checkout({ booking, event, onRestart }) {
  const [token, setToken] = useState('tok_success');
  const [paid, setPaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seconds = useCountdown(booking.holdUntil);
  const expired = seconds === 0;
  const tier = event.tiers.find((t) => t.id === booking.tierId);

  async function handlePay(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setPaid(await pay(booking.reference, token));
    } catch (err) {
      // A declined card keeps the booking pending, so the user can try again.
      setError(err.status === 402 ? 'Card declined. Choose another card or try again.' : err.message);
      setBusy(false);
    }
  }

  if (paid) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 560 }}>
        <Alert severity="success">
          Booking confirmed. Your reference is <strong>{paid.reference}</strong>.
        </Alert>
        <Typography>
          {paid.quantity} × {tier.name} for {event.title}. Paid {formatMoney(paid.amountCents)}.
        </Typography>
        <Button component={RouterLink} to="/" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
          Back to events
        </Button>
      </Stack>
    );
  }

  return (
    <Paper variant="outlined" component="form" onSubmit={handlePay} sx={{ p: 3, maxWidth: 560 }}>
      <Stack spacing={3}>
        <Typography variant="h6" component="h2">
          Checkout · {booking.quantity} × {tier.name}
        </Typography>

        {expired ? (
          <Alert severity="warning" action={<Button color="inherit" onClick={onRestart}>Start again</Button>}>
            Your hold has ended.
          </Alert>
        ) : (
          <Typography role="timer" color="text.secondary">
            Seats held for {formatCountdown(seconds)}
          </Typography>
        )}

        <FormControl>
          <FormLabel id="card-label">Test card</FormLabel>
          <RadioGroup aria-labelledby="card-label" value={token} onChange={(e) => setToken(e.target.value)}>
            <FormControlLabel value="tok_success" control={<Radio />} label="Card that succeeds" />
            <FormControlLabel value="tok_declined" control={<Radio />} label="Card that is declined" />
          </RadioGroup>
        </FormControl>

        {error && <Alert severity="error">{error}</Alert>}

        <Button type="submit" variant="contained" size="large" disabled={busy || expired}>
          {busy ? 'Paying…' : `Pay ${formatMoney(booking.amountCents)}`}
        </Button>
      </Stack>
    </Paper>
  );
}
