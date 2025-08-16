'use client';

import React from 'react';

type Props = {
  left: React.ReactNode;
  right: React.ReactNode;
  initialPercent?: number;
  minLeftPercent?: number;
  minRightPercent?: number;
};

export default function SplitLayout({
  left,
  right,
  initialPercent = 55,
  minLeftPercent = 25,
  minRightPercent = 20,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  // 1) Hydration-safe initial state: identical on server & client
  const [percent, setPercent] = React.useState<number>(initialPercent);

  // 2) After mount, read saved value (client-only)
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem('split:leftPercent');
      if (saved) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed)) setPercent(parsed);
      }
    } catch {}
  }, []);

  // 3) Persist on change (client-only)
  React.useEffect(() => {
    try {
      window.localStorage.setItem('split:leftPercent', String(percent));
    } catch {}
  }, [percent]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let next = (x / rect.width) * 100;
      next = Math.max(minLeftPercent, Math.min(100 - minRightPercent, next));
      setPercent(next);
      e.preventDefault();
    };
    const stop = () => (draggingRef.current = false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
    };
  }, [minLeftPercent, minRightPercent]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div style={{ width: `${percent}%` }} className="h-full min-w-0">
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        onMouseDown={() => (draggingRef.current = true)}
        className="w-1 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 relative"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      <div style={{ width: `${100 - percent}%` }} className="h-full min-w-0">
        {right}
      </div>
    </div>
  );
}
