import { runtime } from './runtime.js';
import { createApp } from './app.js';

const services = await runtime();
const { app } = createApp(services.config, services.repo, services.auth, services.storage);
const server = app.listen(services.config.PORT, () => console.log(`Books API listening on ${services.config.PORT}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(() => { void services.client.close().then(() => process.exit(0)); });
});
