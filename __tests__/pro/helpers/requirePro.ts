import fs from 'fs';
import path from 'path';

/**
 * Load a module from the private `pro/` submodule, or skip the suite when it genuinely is not here.
 *
 * The distinction matters more than it looks. An open-core checkout has no `pro/` at all, and those suites have
 * nothing to test - skipping is right. But a `pro/` that IS present and whose module fails to LOAD is a broken
 * test, and a plain try/catch turns it into a passing one: every case early-returns and the suite reports green
 * having asserted nothing. That happened while writing these - five tests "passed" against a module that could
 * not be imported, because a transitive import needed a native module the jest environment does not provide.
 *
 * So: absent submodule, skip. Present submodule that will not load, throw with the real cause attached.
 */
export function requirePro<T>(specifier: string): T | undefined {
  try {
    return require(specifier) as T;
  } catch (cause) {
    const submodule = path.resolve(__dirname, '../../../pro');
    if (!fs.existsSync(path.join(submodule, 'package.json'))) {
      console.warn(`pro/ is absent - skipping the suite that needs ${specifier}`);
      return undefined;
    }
    throw new Error(
      `pro/ is present but ${specifier} could not be loaded, so this suite would have passed ` +
        `without asserting anything: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
