import { Alert, Stack, Typography } from '@mui/material';

// Placeholder. The role, the login and the guard all work already.
// What staff actually DO (scan QR codes at the door) is Build 11.
export default function Staff() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Check-in
      </Typography>
      <Alert severity="info">
        You are logged in as staff. Scanning tickets at the door arrives in a later build.
      </Alert>
    </Stack>
  );
}
