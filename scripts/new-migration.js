// npm run db:generate -- add_pets   → creates src/db/migrations/0003_add_pets.sql
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migrations');
const name = (process.argv[2] ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');
if (!name) {
  console.error('Usage: npm run db:generate -- <name>');
  process.exit(1);
}
const files = (await fs.readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const next = String((files.length ? parseInt(files.at(-1).slice(0, 4), 10) : 0) + 1).padStart(4, '0');
const file = path.join(dir, `${next}_${name}.sql`);
await fs.writeFile(file, `-- ${next}_${name}\n-- Runs once inside a transaction. Never edit a migration after it has been applied; add a new one.\n\n`);
console.log(`Created ${path.relative(process.cwd(), file)}`);
