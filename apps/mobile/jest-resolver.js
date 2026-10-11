const path = require('node:path');

const contractsSource = path.join('packages', 'contracts', 'src');

/**
 * `@athar/contracts` writes its own relative imports as `./x.js`, as Node's ESM
 * resolution requires, while the files on disk are `x.ts`. Rewrite the suffix for
 * imports made from inside the package, and only there, so no other package's
 * `.js` imports are touched. (Metro does the same in `metro.config.js`.)
 */
module.exports = (request, options) => {
  if (
    request.startsWith('.') &&
    request.endsWith('.js') &&
    options.basedir.includes(contractsSource)
  ) {
    return options.defaultResolver(request.replace(/\.js$/, '.ts'), options);
  }

  return options.defaultResolver(request, options);
};
