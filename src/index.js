import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config = loadConfig(process.env);   // throws fast if API_TOKEN missing
const app = createApp(config);
app.listen(config.port, () => {
  console.log(`codexbar-api listening on :${config.port} (providers: ${config.providers.join(', ')})`);
});
