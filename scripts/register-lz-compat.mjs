/**
 * Module registration hook that fixes lz-string CJS/ESM interop.
 * Usage: npx tsx --import ./scripts/register-lz-compat.mjs scripts/...
 */
import { register } from 'node:module';
register('./lz-hooks.mjs', import.meta.url);
