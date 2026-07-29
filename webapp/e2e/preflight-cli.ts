/**
 * Standalone reachability check: `npm run e2e:preflight`.
 *
 * Run this before the suite. It answers "is the phone reachable and what can it
 * actually do" without launching a browser, so a red result here is a phone
 * problem, never a console problem.
 */
import { probe, summarise } from './support/preflight.ts';

try {
  const result = await probe();
  console.log(summarise(result));
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
