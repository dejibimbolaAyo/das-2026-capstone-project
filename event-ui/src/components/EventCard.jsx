import { Link as RouterLink } from 'react-router-dom';
import { Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { formatDate, formatMoney } from '../lib/format.js';

export default function EventCard({ event }) {
  // The real list sends the totals on each event. The Build 6 mock sends the tiers instead.
  const seatsLeft = event.seatsLeft ?? event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
  const fromCents = event.minPriceCents ?? Math.min(...event.tiers.map((t) => t.priceCents));

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea component={RouterLink} to={`/events/${event.id}`} sx={{ height: '100%' }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" component="h2">
              {event.title}
            </Typography>
            <Typography color="text.secondary">
              {event.venue}, {event.city}
            </Typography>
            <Typography color="text.secondary">{formatDate(event.startsAt)}</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontWeight={700}>From {formatMoney(fromCents)}</Typography>
              {seatsLeft === 0 ? (
                <Chip label="Sold out" color="error" size="small" />
              ) : (
                <Chip label={`${seatsLeft} left`} color="primary" size="small" variant="outlined" />
              )}
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
