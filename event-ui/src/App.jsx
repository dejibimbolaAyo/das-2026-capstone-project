import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { AppBar, Container, Toolbar, Typography } from '@mui/material';
import Home from './pages/Home.jsx';
import EventPage from './pages/EventPage.jsx';

export default function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ color: 'inherit', textDecoration: 'none' }}
          >
            Event Tickets
          </Typography>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="*" element={<Typography>Page not found.</Typography>} />
        </Routes>
      </Container>
    </>
  );
}
