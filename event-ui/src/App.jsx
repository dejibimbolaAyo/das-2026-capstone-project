import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { Alert, AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { useAuth } from './auth/AuthContext.jsx';
import RequireRole from './auth/RequireRole.jsx';
import EventPage from './pages/EventPage.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import MyTickets from './pages/MyTickets.jsx';
import Organizer from './pages/Organizer.jsx';
import Staff from './pages/Staff.jsx';

// Which links each role sees. The server still checks every request; this is just good manners.
const LINKS = {
  attendee: [{ to: '/tickets', label: 'My tickets' }],
  organizer: [{ to: '/organizer', label: 'My events' }],
  staff: [{ to: '/staff', label: 'Check-in' }],
};

function NavBar() {
  const { user, logout } = useAuth();
  return (
    <AppBar position="static">
      <Toolbar sx={{ gap: 1 }}>
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{ color: 'inherit', textDecoration: 'none', mr: 2 }}
        >
          Event Tickets
        </Typography>
        {user && LINKS[user.role]?.map((link) => (
          <Button key={link.to} color="inherit" component={RouterLink} to={link.to}>
            {link.label}
          </Button>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        {user ? (
          <>
            <Typography variant="body2" sx={{ mr: 1 }}>
              {user.name} · {user.role}
            </Typography>
            <Button color="inherit" onClick={logout}>
              Log out
            </Button>
          </>
        ) : (
          <Button color="inherit" component={RouterLink} to="/login">
            Log in
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default function App() {
  const { expired } = useAuth();
  return (
    <>
      <NavBar />
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        {expired && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Your session ended. Please log in again.
          </Alert>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/tickets" element={<RequireRole roles={['attendee']}><MyTickets /></RequireRole>} />
          <Route path="/organizer" element={<RequireRole roles={['organizer']}><Organizer /></RequireRole>} />
          <Route path="/staff" element={<RequireRole roles={['staff']}><Staff /></RequireRole>} />
          <Route path="*" element={<Typography>Page not found.</Typography>} />
        </Routes>
      </Container>
    </>
  );
}
