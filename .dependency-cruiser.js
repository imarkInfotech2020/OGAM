/**
 * dependency-cruiser — the STANDING GATE for the architectural boundaries we keep
 * re-establishing by hand in review (layering, engine DIP, dead code, cycles).
 *
 * It sees the IMPORT GRAPH, not values — so it enforces "a screen may not import a
 * concrete engine service" (the SO2/SO4 class, at the bad import) and "utils/services
 * may not import UI" (the DR1 backward-layering class), but it does NOT catch the
 * `engine === 'litert'` VALUE branch (an ESLint no-restricted-syntax rule guards that)
 * or DRY drift / logic bugs. Complements the hygiene standard; does not replace it.
 *
 * Run: `npm run depcruise`. CI fails on any `error`-severity violation.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Import cycles make load order undefined and desync-prone. Break the cycle (extract the shared piece down a layer).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-backward-layering-utils',
      severity: 'error',
      comment: 'The core layer (utils/services/stores/types) must not import UI (screens/components/navigation). If a screen owns logic the core needs, move the logic DOWN into the core (see DR1: parseModelOutput moved to utils).',
      from: { path: '^src/(utils|services|stores|types|constants|config)/' },
      to: { path: '^src/(screens|components|navigation)/' },
    },
    {
      name: 'utils-stay-pure',
      severity: 'error',
      comment: 'src/utils is the zero-IO pure layer — it must not depend on services or stores. Pure logic here is unit-testable without mocking I/O (hygiene §A).',
      from: { path: '^src/utils/' },
      to: {
        path: '^src/(services|stores)/',
        pathNot: '^src/utils/', // intra-utils imports are fine
      },
    },
    {
      name: 'engine-dip-no-concrete-in-ui',
      severity: 'error',
      comment: 'UI (screens/components) must depend on the engine ABSTRACTION (services/engines), never a concrete engine service (services/litert, services/llm). Branching on a concrete engine in a caller is the DIP violation we keep fixing (SO2/SO4). Route through services/engines.',
      from: { path: '^src/(screens|components)/' },
      to: { path: '^src/services/(litert|llm)(/|\\.|$)' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan module (no importers, imports nothing relevant) — likely dead code. Confirm with grep, then delete (the standing dead-code gate that retires the manual recon). Warn-level until the existing orphan set is triaged.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(d\\.ts|test\\.ts|test\\.tsx)$',
          '^src/types/', // type barrels are legitimately import-only
          '(^|/)index\\.(ts|tsx)$', // barrel/entry files
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
