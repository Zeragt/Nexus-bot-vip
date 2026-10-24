// npm run deploy:commands   → registers slash commands now (ignores the unchanged-hash cache)
import { loadEnv } from '../src/config/env.js';
import { deployCommands } from '../src/discord/deploy.js';
import { scrub } from '../src/core/logger.js';

try {
  const res = await deployCommands(loadEnv(), { force: true, useCache: false });
  console.log(`Deployed ${res.count} commands (${res.scope}).`);
} catch (err) {
  console.error(scrub(err.message));
  process.exitCode = 1;
}
