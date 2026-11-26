import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Typography } from '@mui/material';
import { useAuth } from './AuthContext.jsx';

// Wraps a page. Not logged in -> login page (and back here afterwards).
// Wrong role -> a clear "not for you" message.
// This is for the user's comfort only: the SERVER is what actually refuses.
export default function RequireRole({ roles, children }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) return <Typography role="status">Checking your session…</Typography>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) {
    return (
      <Alert severity="warning">
        This page is for {roles.join(' or ')} accounts. You are logged in as {user.role}.
      </Alert>
    );
  }
  return children;
}
