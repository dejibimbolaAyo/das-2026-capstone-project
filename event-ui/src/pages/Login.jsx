import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { homeFor, useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('attendee');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from;
  if (user) return <Navigate to={from ?? homeFor(user)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const who =
        mode === 'login'
          ? await login({ email, password })
          : await signup({ name, email, password, role });
      // Attendees go back to where they were heading. Others go to their own home.
      navigate(who.role === 'attendee' && from ? from : homeFor(who), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const signingUp = mode === 'signup';

  return (
    <Paper variant="outlined" component="form" onSubmit={handleSubmit} sx={{ p: 3, maxWidth: 440, mx: 'auto' }}>
      <Stack spacing={2.5}>
        <Typography variant="h5" component="h1">
          {signingUp ? 'Create your account' : 'Log in'}
        </Typography>

        {signingUp && (
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        )}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          helperText={signingUp ? 'At least 8 characters.' : undefined}
        />

        {signingUp && (
          <FormControl>
            <FormLabel id="role-label">I want to</FormLabel>
            <RadioGroup aria-labelledby="role-label" value={role} onChange={(e) => setRole(e.target.value)}>
              <FormControlLabel value="attendee" control={<Radio />} label="Buy tickets (attendee)" />
              <FormControlLabel value="organizer" control={<Radio />} label="Run events (organizer)" />
              <FormControlLabel value="staff" control={<Radio />} label="Check people in (staff)" />
            </RadioGroup>
            <Typography variant="caption" color="text.secondary">
              Classroom shortcut: here anyone can pick any role. A real product would let only an admin make organizers
              and staff.
            </Typography>
          </FormControl>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'One moment…' : signingUp ? 'Sign up' : 'Log in'}
        </Button>

        <Typography variant="body2">
          {signingUp ? 'Already have an account? ' : 'New here? '}
          <Link
            component="button"
            type="button"
            onClick={() => {
              setMode(signingUp ? 'login' : 'signup');
              setError('');
            }}
          >
            {signingUp ? 'Log in' : 'Create an account'}
          </Link>
        </Typography>
      </Stack>
    </Paper>
  );
}
