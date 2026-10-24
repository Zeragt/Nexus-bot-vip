// Entry point: `npm start` (or `node index.js`) on Wispbyte / any Node 22 host.
// Load .env first so every module (logger, renderer) sees the configuration.
import './src/config/dotenv.js';
import { main } from './src/index.js';
import { logger, scrub } from './src/core/logger.js';

main().catch((err) => {
  logger.fatal({ err: scrub(err?.stack ?? String(err)) }, 'Nexus failed to start');
  process.exit(1);
});
