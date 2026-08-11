/**
 * What this build calls itself.
 *
 * The version a user reads has to come from the ARTIFACT, never from a source file. `package.json`
 * carries the LIVE PRODUCTION version: `scripts/promote.sh` bumps it when a beta is blessed, so
 * throughout a beta cycle it is deliberately one patch behind the binary under test. Reading it in
 * the UI is what made the 0.0.103 betas introduce themselves as 0.0.102 on every screen and in
 * every feedback mail, while Play and the tag both said 0.0.103.
 *
 * These read Android's `versionName` and iOS's `MARKETING_VERSION` - the same strings Play,
 * TestFlight and the OS app list show the user - so a release script that forgets a bump can no
 * longer produce a label that disagrees with the file they installed.
 *
 * One owner, because the alternative is what we had: four call sites each deciding for themselves
 * where the version comes from, and no single place to correct when the answer is wrong.
 *
 * Both calls are synchronous. The values are native build constants read at startup, not a lookup,
 * so awaiting them only obscures that a version cannot fail to arrive.
 */
import { getBuildNumber, getVersion } from 'react-native-device-info';

/** The user-facing version of this build: Android `versionName` / iOS `MARKETING_VERSION`. */
export const appVersion = (): string => getVersion();

/**
 * The store build id: Android `versionCode` / iOS `CURRENT_PROJECT_VERSION`.
 *
 * Not exported. A build id on its own identifies nothing to a reader, and the one place that needs
 * it wants it next to the version - so it is offered only in that form, below.
 */
const appBuildNumber = (): string => getBuildNumber();

/**
 * Version and build together, for a report that has to name the EXACT binary.
 *
 * A version alone cannot: every beta in a cycle ships the same `versionName`, and only the build id
 * separates them. A tester saying "0.0.103" leaves four candidates; the build id leaves one.
 */
export const appBuildLabel = (): string =>
  `v${appVersion()} (build ${appBuildNumber()})`;
