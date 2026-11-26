import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useMyBookings } from '../hooks/useMyBookings.js';
import { formatDate, formatMoney } from '../lib/format.js';

const STATUS_COLOR = { paid: 'success', checked_in: 'success', pending: 'warning', cancelled: 'default', refunded: 'default' };

export default function MyTickets() {
  const { bookings, status, error } = useMyBookings();

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        My tickets
      </Typography>

      {status === 'loading' && <Typography role="status">Loading your tickets…</Typography>}
      {status === 'error' && <Alert severity="error">Could not load your tickets. {error}</Alert>}
      {status === 'empty' && (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography role="status">You have no tickets yet.</Typography>
          <Button component={RouterLink} to="/" variant="contained">
            Find an event
          </Button>
        </Stack>
      )}

      {status === 'ready' && (
        <Stack component="ul" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {bookings.map((b) => (
            <Paper key={b.reference} component="li" variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Typography variant="h6" component="h2">
                    {b.event.title}
                  </Typography>
                  <Typography color="text.secondary">
                    {b.event.venue}, {b.event.city} · {formatDate(b.event.startsAt)}
                  </Typography>
                  <Typography sx={{ mt: 1 }}>
                    {b.quantity} × {b.tierName} · {formatMoney(b.amountCents)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Reference <strong>{b.reference}</strong>
                  </Typography>
                </div>
                <Chip label={b.status} color={STATUS_COLOR[b.status] ?? 'default'} size="small" />
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
