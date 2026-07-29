import { useRef, useState } from 'react';

/**
 * Drag-to-compare wipe between the original and the processed image.
 *
 * A face effect is often a small change to a large photo, so a side-by-side
 * pair makes the difference harder to see rather than easier. The two images
 * are stacked and the top one is clipped to the handle position.
 */
export function BeforeAfter({
  before,
  after,
  alt = 'Result',
}: {
  before: string;
  after: string;
  alt?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);

  const moveTo = (clientX: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPosition(Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded-lg"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) moveTo(event.clientX);
        }}
      >
        <img src={after} alt={alt} className="block w-full" />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img src={before} alt="Original" className="block w-full" />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-cyan-a"
          style={{ left: `${position}%` }}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-navy/80 px-2 py-0.5 text-[11px] text-ink-2">
          Before
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-navy/80 px-2 py-0.5 text-[11px] text-cyan-a">
          After
        </span>
      </div>
      {/* The drag handle is pointer-only; this keeps the wipe reachable by
          keyboard and gives assistive tech something to operate. */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Before / after wipe"
        onChange={(event) => setPosition(Number(event.target.value))}
        className="w-full accent-cyan-a"
      />
    </div>
  );
}
