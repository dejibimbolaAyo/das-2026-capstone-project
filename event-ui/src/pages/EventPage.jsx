import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import Checkout from '../components/Checkout.jsx';
import TicketForm from '../components/TicketForm.jsx';
import { useEvent } from '../hooks/useEvent.js';
import { formatDate } from '../lib/format.js';

export default function EventPage() {
  const { id } = useParams();
  const { event, status } = useEvent(id);
  const [booking, setBooking] = useState(null);

  if (status === 'loading') return <Typography role="status">Loading event…</Typography>;
  if (status === 'notfound') return <Alert severity="warning">That event does not exist.</Alert>;
  if (status === 'error') return <Alert severity="error">Could not load this event. Please try again.</Alert>;

  return (
    <Stack spacing={3}>
      <Button component={RouterLink} to="/" sx={{ alignSelf: 'flex-start' }}>
        ← All events
      </Button>
      <Box>
        <Typography variant="h4" component="h1">
          {event.title}
        </Typography>
        <Typography color="text.secondary">
          {event.venue}, {event.city} · {formatDate(event.startsAt)}
        </Typography>
      </Box>

      {booking ? (
        <Checkout booking={booking} event={event} onRestart={() => setBooking(null)} />
      ) : (
        <TicketForm event={event} onBooked={setBooking} />
      )}
    </Stack>
  );
}
