/**
 * Build an assembly from a TypeScript file that exports a builder chain,
 * serialize to a share link URL, and print it.
 *
 * The input file should default-export or assign to `module.exports` a function
 * that returns an Engine, OR it can simply be a script that calls `output(engine)`.
 *
 * Simplest usage — the input file calls `output()`:
 *
 *   import { AssemblyBuilder } from '../src/builder';
 *   import { output } from '../scripts/build-assembly-helpers';
 *   const { engine } = AssemblyBuilder.basicBox(150, 100, 80).build();
 *   output(engine);
 *
 * Usage:
 *   npx tsx --import ./scripts/register-lz-compat.mjs scripts/build-assembly.ts <input-file.ts>
 */

import { resolve } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npx tsx --import ./scripts/register-lz-compat.mjs scripts/build-assembly.ts <input-file.ts>');
  process.exit(1);
}

const resolved = resolve(inputPath);

// Dynamically import the user's script — it will call output() which prints the URL
try {
  await import(resolved);
} catch (e) {
  const err = e as Error;
  console.error(`Error executing ${inputPath}:`);
  console.error(err.message);
  if (err.stack) {
    // Show only the relevant stack frames
    const lines = err.stack.split('\n').filter(l => !l.includes('node_modules'));
    console.error(lines.join('\n'));
  }
  process.exit(1);
}
