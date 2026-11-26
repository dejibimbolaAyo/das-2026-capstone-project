import { useState } from 'react';
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
  TextField,
  Typography,
} from '@mui/material';
import { createBooking } from '../api/api.js';
import { formatMoney } from '../lib/format.js';

export default function TicketForm({ event, onBooked }) {
  const firstAvailable = event.tiers.find((t) => t.seatsLeft > 0);
  const [tierId, setTierId] = useState(firstAvailable?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!firstAvailable) return <Alert severity="info">This event is sold out.</Alert>;

  // Everything below is calculated from state, never stored.
  const tier = event.tiers.find((t) => t.id === tierId);
  const max = Math.min(10, tier.seatsLeft);
  const invalid = !Number.isInteger(quantity) || quantity < 1 || quantity > max;
  const totalCents = invalid ? 0 : tier.priceCents * quantity;

  async function handleSubmit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError('');
    try {
      onBooked(await createBooking({ tierId, quantity }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Paper variant="outlined" component="form" onSubmit={handleSubmit} sx={{ p: 3, maxWidth: 560 }}>
      <Stack spacing={3}>
        <FormControl>
          <FormLabel id="tier-label">Ticket type</FormLabel>
          <RadioGroup
            aria-labelledby="tier-label"
            value={tierId}
            onChange={(e) => {
              setTierId(e.target.value);
              setQuantity(1);
            }}
          >
            {event.tiers.map((t) => (
              <FormControlLabel
                key={t.id}
                value={t.id}
                disabled={t.seatsLeft === 0}
                control={<Radio />}
                label={`${t.name} · ${formatMoney(t.priceCents)} · ${t.seatsLeft === 0 ? 'Sold out' : `${t.seatsLeft} left`}`}
              />
            ))}
          </RadioGroup>
        </FormControl>

        <TextField
          label="Quantity"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          error={invalid}
          helperText={`Choose 1 to ${max}`}
          slotProps={{ htmlInput: { min: 1, max } }}
          sx={{ maxWidth: 200 }}
        />

        <Typography variant="h6" aria-live="polite">
          Total: {formatMoney(totalCents)}
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <Button type="submit" variant="contained" size="large" disabled={invalid || busy}>
          {busy ? 'Reserving…' : 'Book tickets'}
        </Button>
      </Stack>
    </Paper>
  );
}
