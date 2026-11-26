import { createTheme } from '@mui/material/styles';

// Design tokens live here once. Components read them; they never hard-code colours.
export const theme = createTheme({
  palette: {
    primary: { main: '#0B7A41' },
    background: { default: '#EEF2F1' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 800 },
    h6: { fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 700 } },
    },
  },
});
