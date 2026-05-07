import React, { useEffect, useRef } from 'react';

export default function Splitter({ side, onResize }) {
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return;
      const x = e.clientX;
      const w = window.innerWidth;
      const next = side === 'left' ? x : (w - x);
      onResize(Math.max(180, Math.min(800, next)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [side, onResize]);

  return (
    <div
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
      }}
      className="w-1 bg-slate-300 hover:bg-blue-400 active:bg-blue-500 cursor-ew-resize transition-colors shrink-0"
    />
  );
}
