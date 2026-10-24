// Entry point: `npm start` (or `node index.js`) on Wispbyte / any Node 22 host.
// Load .env first so every module (logger, renderer) sees the configuration.
import './src/config/dotenv.js';
import { preflight } from './src/preflight.js';

// Check the install before the native canvas library loads, since a damaged file crashes it
// with no message at all.
const problems = preflight();
if (problems.length) {
  console.error('\n❌ لا يمكن تشغيل Nexus بسبب مشاكل في الملفات:\n' + problems.map((p) => `  • ${p}`).join('\n') + '\n');
  process.exit(1);
}
console.log('[preflight] ok, loading the bot…');

const { main } = await import('./src/index.js');
const { logger, scrub } = await import('./src/core/logger.js');

main().catch((err) => {
  logger.fatal({ err: scrub(err?.stack ?? String(err)) }, 'Nexus failed to start');
  process.exit(1);
});
