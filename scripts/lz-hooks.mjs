/**
 * Module loader hooks for lz-string CJS/ESM compat.
 * Rewrites lz-string to a module that uses createRequire.
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);

  // If a module imports from 'lz-string', we need it to get named exports.
  // But lz-string is CJS and only provides a default export in ESM context.
  // We intercept the lz-string module and replace its source with a wrapper.
  if (url.includes('node_modules/lz-string') && result.format === 'commonjs') {
    return {
      ...result,
      format: 'module',
      source: `
        import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        const lz = require('lz-string');
        export const compressToEncodedURIComponent = lz.compressToEncodedURIComponent;
        export const decompressFromEncodedURIComponent = lz.decompressFromEncodedURIComponent;
        export default lz;
      `,
    };
  }

  return result;
}
