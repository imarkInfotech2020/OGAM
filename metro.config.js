const path = require('node:path');
const fs = require('node:fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const proPackagePath = path.resolve(__dirname, 'pro');
const proStubPath = path.resolve(__dirname, 'src/bootstrap/proStub.js');
// pro/ is a git submodule: the directory exists even when not checked out, so test
// for a real file inside it (package.json) to detect a populated submodule.
const proExists = fs.existsSync(path.resolve(proPackagePath, 'package.json'));

// @offgrid/sync lives OUTSIDE the project root (shared monorepo). Metro must watch its dist and
// resolve the package + its subpath adapters. We map the subpaths to concrete built files rather
// than enabling `unstable_enablePackageExports` globally (that flag changes resolution for every
// dep and breaks libraries with malformed exports maps). The package ships prebuilt CJS in dist/.
const syncPackagePath = path.resolve(__dirname, '../shared/packages/sync');
const ragPackagePath = path.resolve(__dirname, '../shared/packages/rag');

const config = {
  // pro/ is a submodule inside the project root, so Metro already watches it by default. The sync
  // package is out-of-root, so Metro must be told to watch it (for its dist) — nothing else needed.
  watchFolders: [syncPackagePath, ragPackagePath],
  resolver: {
    // When resolving modules from outside the project root (i.e. @offgrid/pro),
    // Metro falls back here so @babel/runtime and all other peer deps are found.
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      // Exposes src/ as @offgrid/core so @offgrid/pro can import the design system,
      // stores, and registries without a circular package dependency.
      '@offgrid/core': path.resolve(__dirname, 'src'),
      // Shared, pure-TS RAG decisions. Mobile supplies storage, extraction, and embeddings.
      '@offgrid/rag': ragPackagePath,
      // Points to the real pro package when present on disk (store builds),
      // falls back to a null stub so free builds bundle cleanly.
      '@offgrid/pro': proExists ? proPackagePath : proStubPath,
      // Single source of truth for react-native-fs. The app imports
      // 'react-native-fs', but executorch's bare-resource-fetcher pulls the
      // maintained fork '@dr.pogodin/react-native-fs'. Shipping both produces
      // duplicate RNFS Objective-C symbols at link time on iOS, so we alias the
      // old name onto the fork and keep a single native module.
      'react-native-fs': path.resolve(__dirname, 'src/shims/react-native-fs.ts'),
      // @offgrid/sync (out-of-root, prebuilt CJS). Main + subpath adapters mapped explicitly so we
      // don't have to enable global package-exports. Keep in step with the package's exports map.
      '@offgrid/sync': syncPackagePath,
      '@offgrid/sync/rn': path.resolve(syncPackagePath, 'dist/adapters/rn-tcp.js'),
      '@offgrid/sync/rn-discovery': path.resolve(syncPackagePath, 'dist/adapters/rn-discovery.js'),
      '@offgrid/sync/portable': path.resolve(syncPackagePath, 'dist/portable/index.js'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
