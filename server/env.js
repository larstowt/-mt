import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Indlaeser .env hvis den findes. Ingen afhaengigheder – Node kan det selv fra v20.6. */
export function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '.env');
  if (!existsSync(file)) return false;
  try {
    process.loadEnvFile(file);
    return true;
  } catch (err) {
    console.error(`[env] kunne ikke laese .env: ${err.message}`);
    return false;
  }
}
