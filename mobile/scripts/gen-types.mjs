import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mobileRoot = dirname(fileURLToPath(new URL('..', import.meta.url)));
const outFile = join(mobileRoot, 'src', 'types', 'database.ts');
const aliasesFile = join(mobileRoot, 'scripts', 'types-aliases.ts');

// The maintained convenience-alias block. The generator embeds it (minus its
// `import type { Database }` line, since `Database` is defined in the output)
// verbatim underneath the regenerated `Database` interface.
const aliasesSource = readFileSync(aliasesFile, 'utf8');
const importLine = /^\s*import type \{ Database \} from '\.\.\/src\/types\/database';\s*\n/;
const aliasesBody = aliasesSource.replace(importLine, '').trimEnd();

const local = process.argv.includes('--local');
const dbUrl = process.env.SUPABASE_DB_URL;

let generated;
if (local) {
  generated = runSupabase(['gen', 'types', 'typescript', '--local']);
} else if (dbUrl) {
  generated = runSupabase(['gen', 'types', 'typescript', '--db-url', dbUrl]);
} else {
  console.error(
    'No target database. Set SUPABASE_DB_URL (e.g. ' +
      'postgresql://postgres:postgres@localhost:54322/postgres) or pass --local.',
  );
  process.exit(1);
}

const jsonIndex = generated.indexOf('export type Json =');
if (jsonIndex === -1) {
  console.error('Unexpected `supabase gen types` output — could not find `export type Json`.');
  process.exit(1);
}
const databaseBody = generated.slice(jsonIndex).trimEnd();

const header = `/**
 * Type definitions matching the NEXA PostgreSQL schema.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate after changing supabase/migrations by running:
 *   cd mobile && npm run types:gen
 * The convenience aliases below the Database interface live in
 * mobile/scripts/types-aliases.ts and are appended by the generator.
 */

`;

writeFileSync(outFile, header + databaseBody + '\n\n' + aliasesBody + '\n');
console.log(`Regenerated ${outFile}`);
console.log('Remember: if you added schema objects, extend mobile/scripts/types-aliases.ts with new aliases.');

function runSupabase(args) {
  const npm = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    return execFileSync(npm, ['supabase', ...args], {
      cwd: mobileRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.stdout && error.stderr) {
      console.error(error.stdout);
      console.error(error.stderr);
    }
    console.error(
      'Failed to run `supabase gen types typescript`. Is the Supabase CLI installed and the database reachable?',
    );
    process.exit(1);
  }
}