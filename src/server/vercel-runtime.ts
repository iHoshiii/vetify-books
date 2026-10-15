import { runtime } from './runtime.js';
import { createApp } from './app.js';

let services: ReturnType<typeof runtime> | undefined;
export function vercelServices() {
  services ??= runtime().catch((error) => { services = undefined; throw error; });
  return services;
}
let application: Promise<ReturnType<typeof createApp>['app']> | undefined;
export function vercelApp() {
  application ??= vercelServices().then(({ config, repo, auth, storage }) => createApp(config, repo, auth, storage).app)
    .catch((error) => { application = undefined; throw error; });
  return application;
}
