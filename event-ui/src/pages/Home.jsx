import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import EventCard from '../components/EventCard.jsx';
import { useEvents } from '../hooks/useEvents.js';

const CITIES = ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'];

// One place decides what the results area shows: loading, error, empty or the list.
function Results({ events, total, status, error, hasMore, loadMore, loadingMore, loadMoreError }) {
  if (status === 'loading') {
    return (
      <Box>
        <Typography role="status" color="text.secondary" sx={{ mb: 2 }}>
          Loading events…
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} variant="rounded" height={170} />
          ))}
        </Box>
      </Box>
    );
  }
  if (status === 'error') return <Alert severity="error">Could not load events. {error}</Alert>;
  if (status === 'empty') return <Typography role="status">No events match. Try clearing a filter.</Typography>;

  return (
    <Stack spacing={2}>
      <Typography role="status" color="text.secondary">
        Showing {events.length.toLocaleString()} of {total.toLocaleString()} events
      </Typography>
      <Box
        component="ul"
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          listStyle: 'none',
          p: 0,
          m: 0,
        }}
      >
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </Box>
      {loadMoreError && <Alert severity="error">Could not load more. {loadMoreError}</Alert>}
      {hasMore && (
        <Button variant="outlined" onClick={loadMore} disabled={loadingMore} sx={{ alignSelf: 'center' }}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Stack>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState('date');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const list = useEvents({ q, city, onlyAvailable, sort });

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Upcoming events
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField
          label="Search events"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1 }}
        />
        <FormControl sx={{ minWidth: 170 }}>
          <InputLabel id="city-label">City</InputLabel>
          <Select labelId="city-label" label="City" value={city} onChange={(e) => setCity(e.target.value)}>
            <MenuItem value="">All cities</MenuItem>
            {CITIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 170 }}>
          <InputLabel id="sort-label">Sort by</InputLabel>
          <Select labelId="sort-label" label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
            <MenuItem value="date">Date</MenuItem>
            <MenuItem value="price">Price</MenuItem>
            <MenuItem value="availability">Availability</MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={<Switch checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />}
          label="Only available"
        />
      </Stack>

      <Results {...list} />
    </Stack>
  );
}
