import { createApp } from './http/app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Event Ticketing App running on port ${config.port}`);
});