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

const projectRoot = __dirname;
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

module.exports = config;
