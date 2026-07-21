// Publishes the single-file console as a GitHub release asset, giving the iOS
// app a stable one-click download URL:
//   https://github.com/AndersFB/Sidecar-ML-Console/releases/latest/download/sidecar-ml-console.html
//
// Creates release v<version from package.json> if it doesn't exist, otherwise
// replaces the asset on it. Run AFTER committing and pushing, so the release
// tag lands on the pushed commit: `npm run release` (which rebuilds first).
// Requires the GitHub CLI (`gh`) to be authenticated.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${pkg.version}`;
const artifact = fileURLToPath(new URL('../../sidecar-ml-console.html', import.meta.url));

const NOTES = `Single-file Sidecar ML web console.

Download \`sidecar-ml-console.html\`, open it in a browser on any device on the
same Wi-Fi as the iPhone (double-clicking the downloaded file works), enter the
address shown in the Sidecar ML app, and connect.`;

const gh = (args, opts = {}) => execFileSync('gh', args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });

let exists = true;
try {
  execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
} catch {
  exists = false;
}

if (exists) {
  gh(['release', 'upload', tag, artifact, '--clobber']);
  console.log(`release: replaced the console asset on existing release ${tag}`);
} else {
  gh(['release', 'create', tag, artifact, '--title', `Sidecar ML Console ${tag}`, '--notes', NOTES]);
  console.log(`release: created ${tag} with the console asset`);
}
console.log(
  'stable download URL: https://github.com/AndersFB/Sidecar-ML-Console/releases/latest/download/sidecar-ml-console.html',
);
