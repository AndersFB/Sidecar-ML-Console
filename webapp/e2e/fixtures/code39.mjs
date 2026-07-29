/**
 * Code 39 encoder — chosen over QR because it needs no error-correction maths:
 * every character is nine elements (5 bars, 4 spaces) of which exactly three
 * are wide, there is no checksum, and `*` delimits both ends.
 *
 * The phone's /v1/vision/barcodes lists `code39` among its symbologies, so this
 * exercises the same endpoint a QR would.
 *
 * Each pattern is 9 elements, alternating bar/space starting with a bar.
 * 'n' = narrow, 'w' = wide.
 */
const PATTERNS = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn',
};

const NARROW = 2;
const WIDE = 6;

/**
 * Returns the bar/space run lengths in pixels, starting with a bar and
 * alternating. Wrap the payload in `*` and separate characters by a narrow gap.
 */
export function code39Modules(payload) {
  const text = payload.toUpperCase();
  for (const char of text) {
    if (!(char in PATTERNS)) throw new Error(`Code 39 cannot encode ${JSON.stringify(char)}`);
  }
  const runs = [];
  const chars = `*${text}*`;
  for (let i = 0; i < chars.length; i++) {
    for (const element of PATTERNS[chars[i]]) {
      runs.push(element === 'w' ? WIDE : NARROW);
    }
    // Inter-character gap (a narrow space) — omitted after the final character.
    if (i < chars.length - 1) runs.push(NARROW);
  }
  return runs;
}

/** Renders the runs as an HTML string of absolutely positioned bars. */
export function code39Html(payload, { height = 160, quietZone = 40 } = {}) {
  const runs = code39Modules(payload);
  let x = quietZone;
  let bars = '';
  runs.forEach((width, index) => {
    // Even indices are bars, odd are spaces.
    if (index % 2 === 0) {
      bars += `<div style="position:absolute;left:${x}px;top:0;width:${width}px;height:${height}px;background:#000"></div>`;
    }
    x += width;
  });
  const total = x + quietZone;
  return `<div style="position:relative;width:${total}px;height:${height}px;background:#fff">${bars}</div>`;
}
