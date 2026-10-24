// npm run build: there is no compile step in plain JS, so "build" verifies the project instead:
// every module imports cleanly, commands serialize within Discord's limits, and migrations are present.
import { commandList, buildRegistry } from '../src/commands/index.js';
import { listMigrations } from '../src/db/migrate.js';
import { commandSize } from '../src/discord/limits.js';
import { registerFonts } from '../src/render/fonts.js';

const problems = [];
const { commands, components } = buildRegistry();
for (const c of commandList) {
  const json = c.data.toJSON();
  const size = commandSize(json);
  if (size > 8000) problems.push(`/${json.name} is ${size} characters (limit 8000)`);
  if ((json.options ?? []).length > 25) problems.push(`/${json.name} has more than 25 options`);
}
const migrations = await listMigrations();
if (!migrations.length) problems.push('No migrations found');
registerFonts();

if (problems.length) {
  console.error(`Build check failed:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log(`✔ ${commands.size} commands, ${components.size} component handlers, ${migrations.length} migrations, fonts OK`);
