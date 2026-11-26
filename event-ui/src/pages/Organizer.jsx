import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { addTier, createEvent, listMyEvents, publishEvent, unpublishEvent } from '../api/api.js';
import { formatDate, formatMoney, parseMoneyToCents } from '../lib/format.js';

function NewEventForm({ onCreated }) {
  const [form, setForm] = useState({ title: '', city: '', venue: '', startsAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // <input type="datetime-local"> gives local time with no zone. The API wants an exact instant.
      await createEvent({ ...form, startsAt: new Date(form.startsAt).toISOString() });
      setForm({ title: '', city: '', venue: '', startsAt: '' });
      onCreated();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <Paper variant="outlined" component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          New event
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Title" value={form.title} onChange={set('title')} required sx={{ flex: 2 }} />
          <TextField label="City" value={form.city} onChange={set('city')} required sx={{ flex: 1 }} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Venue" value={form.venue} onChange={set('venue')} sx={{ flex: 2 }} />
          <TextField
            label="Starts"
            type="datetime-local"
            value={form.startsAt}
            onChange={set('startsAt')}
            required
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: 1 }}
          />
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: 'flex-start' }}>
          {busy ? 'Saving…' : 'Create draft'}
        </Button>
      </Stack>
    </Paper>
  );
}

function TierForm({ eventId, onAdded }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const priceCents = parseMoneyToCents(price);
    if (priceCents === null) return setError('Price must be a number like 2500 or 2500.50');
    setBusy(true);
    setError('');
    try {
      await addTier(eventId, { name, priceCents, capacity: Number(capacity) });
      setName('');
      setPrice('');
      setCapacity('');
      onAdded();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField size="small" label="Tier name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField size="small" label="Price (₦)" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <TextField
          size="small"
          label="Seats"
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
        <Button type="submit" variant="outlined" disabled={busy}>
          Add tier
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function EventRow({ event, onChanged }) {
  const [error, setError] = useState('');
  const published = event.status === 'published';

  async function toggle() {
    setError('');
    try {
      await (published ? unpublishEvent(event.id) : publishEvent(event.id));
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Typography variant="h6" component="h3">
              {event.title}
            </Typography>
            <Typography color="text.secondary">
              {event.venue}, {event.city} · {formatDate(event.startsAt)}
            </Typography>
          </div>
          <Chip label={event.status} color={published ? 'success' : 'default'} size="small" />
        </Stack>

        {event.tiers.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tiers yet. Add one before you can publish.
          </Typography>
        ) : (
          <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {event.tiers.map((t) => (
              <Typography key={t.id} component="li" variant="body2">
                {t.name} · {formatMoney(t.priceCents)} · {t.sold}/{t.capacity} sold
              </Typography>
            ))}
          </Stack>
        )}

        <TierForm eventId={event.id} onAdded={onChanged} />
        {error && <Alert severity="error">{error}</Alert>}
        <Button onClick={toggle} variant={published ? 'outlined' : 'contained'} sx={{ alignSelf: 'flex-start' }}>
          {published ? 'Unpublish' : 'Publish'}
        </Button>
      </Stack>
    </Paper>
  );
}

export default function Organizer() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    return listMyEvents()
      .then((data) => {
        setEvents(data.events);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        My events
      </Typography>

      <NewEventForm onCreated={refresh} />

      {status === 'loading' && <Typography role="status">Loading your events…</Typography>}
      {status === 'error' && <Alert severity="error">Could not load your events. {error}</Alert>}
      {status === 'ready' && events.length === 0 && (
        <Typography role="status">You have no events yet. Create your first one above.</Typography>
      )}
      {status === 'ready' && events.length > 0 && (
        <Stack component="ul" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {events.map((event) => (
            <EventRow key={event.id} event={event} onChanged={refresh} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
