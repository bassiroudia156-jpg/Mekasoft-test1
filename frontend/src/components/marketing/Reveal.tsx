'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Scroll-triggered entrance animation for landing-page sections (request,
// 2026-08-18: "un peu d'animation... sur les pages"). IntersectionObserver
// instead of an animation library — the project has none and one wasn't
// worth adding for a single fade-up effect. Fires once (disconnects after
// the first intersection) so scrolling back up and down doesn't replay it.
// Sections below the fold start invisible until scrolled into view *and*
// hydrated — acceptable for a marketing page; the hero itself does NOT use
// this (see app/page.tsx) since it's visible on first paint and gets a
// plain `.animate-fade-in-up` class instead, which runs with no JS/observer
// needed and avoids any above-the-fold flash-of-invisible-content.
export default function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? 'animate-fade-in-up' : 'opacity-0'} ${className ?? ''}`}>
      {children}
    </div>
  );
}
