'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

export interface FaqItem {
  q: string;
  a: string;
}

// Banani's static export renders every answer already expanded next to a
// decorative "+" that does nothing (a design-tool export has no real
// interactivity) — shipping that literally would read as a broken button
// (click "+", nothing happens), the same "no dead affordance" call made
// repeatedly elsewhere in this project. Real accordion instead: collapsed
// by default, click toggles, icon rotates open/closed. Only stateful piece
// of the landing page — isolated here so app/page.tsx itself stays a
// server component.
export default function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {faqs.map((faq, i) => {
        const open = openIndex === i;
        return (
          <div key={faq.q} className="bg-background border border-border rounded-lg p-4 lg:p-5">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-start justify-between gap-3 lg:gap-4 text-left"
            >
              <span className="font-medium text-foreground text-xs lg:text-sm">{faq.q}</span>
              <Icon
                i="plus"
                size={14}
                className={`text-muted-foreground flex-shrink-0 mt-0.5 w-3.5 h-3.5 lg:w-4 lg:h-4 transition-transform ${
                  open ? 'rotate-45' : ''
                }`}
              />
            </button>
            {/* CSS grid-rows trick for a smooth expand/collapse (2026-08-18
                animation request) without measuring heights in JS: the row
                track animates between 0fr and 1fr, the child needs
                overflow-hidden since its rendered height still exceeds 0
                mid-transition. */}
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? 'grid-rows-[1fr] mt-2 lg:mt-3' : 'grid-rows-[0fr]'
              }`}
            >
              <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed overflow-hidden">
                {faq.a}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
