const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration.
 *
 * ATHAR is a pnpm workspace, which means dependencies are not hoisted into a
 * single `node_modules` at the repository root. Metro has to be told about the
 * workspace explicitly, otherwise it cannot resolve packages imported by
 * `apps/mobile` or follow the `@athar/contracts` symlink into
 * `packages/contracts`.
 */

// Windows: Expo started from some shells (e.g. VS Code) sees the path as `c:\...`,
// while pnpm's symlinks resolve to `C:\...`. Metro compares paths case-sensitively,
// so with a lowercase drive it cannot find `expo-router/entry` and the web page
// gets a 404 instead of the bundle. Always use an uppercase drive letter.
const upperDrive = (p) => p.replace(/^[a-z]:/, (drive) => drive.toUpperCase());

const projectRoot = upperDrive(__dirname);
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits in shared packages trigger a rebuild.
config.watchFolders = [workspaceRoot];

// Extra roots to search when resolving a bare import from application code.
// They come first so that the app's own dependencies win over anything hoisted
// elsewhere in the workspace.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// NOTE: `disableHierarchicalLookup` is deliberately left at its default
// (false). pnpm keeps each package's dependencies in a content-addressed store
// under `node_modules/.pnpm/<pkg>/node_modules`, so a package such as
// `expo-router` can only find *its own* dependencies by walking up from its
// real location in the store. Disabling the hierarchical lookup breaks exactly
// that, and the bundler then fails to resolve transitive imports.

// `@athar/contracts` is consumed from its TypeScript source, so an edit there
// reaches the app through Metro's normal reload instead of needing `dist` to
// be rebuilt first. Production behaviour is unchanged: the API still runs the
// compiled package, and this only affects what Metro bundles.
//
// Two things need help. The bare specifier is mapped straight to the source
// entry, which does not depend on how Metro handles custom export conditions.
// And the
// package's own relative imports are written `./api.js`, as Node's ESM
// resolution requires, while the file on disk is `api.ts`; Metro does not map
// `.js` to `.ts`, so that suffix is rewritten for files inside the package.
const contractsSource = path.resolve(workspaceRoot, 'packages', 'contracts', 'src');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@athar/contracts') {
    return { type: 'sourceFile', filePath: path.join(contractsSource, 'index.ts') };
  }

  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    context.originModulePath.startsWith(contractsSource)
  ) {
    return context.resolveRequest(context, moduleName.replace(/.js$/, '.ts'), platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
