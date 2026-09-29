const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * @congtrade/shared lives above this folder, at the repository root, and is
 * linked in by npm workspaces rather than published. Metro watches only the
 * project directory by default, so without these two lines the import resolves
 * at typecheck and then fails at bundle time.
 *
 * mobile is deliberately not one of the root npm workspaces, so its own
 * node_modules is searched first and the root's second.
 */
const workspaceRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Aliased to the source folder rather than left to the package's exports map.
// That map points subpaths at .ts files, which Metro will not resolve through
// exports; pointed at the folder instead, Metro appends its own sourceExts and
// finds them. The tsconfig path mapping says the same thing for the compiler.
config.resolver.extraNodeModules = {
  '@congtrade/shared': path.resolve(workspaceRoot, 'shared/src'),
};

module.exports = config;
