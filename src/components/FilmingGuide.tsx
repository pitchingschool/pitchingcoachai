"use client";

import { useState } from "react";

export default function FilmingGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-white/40 hover:text-white/60 transition-colors flex items-center gap-1.5 mx-auto"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How to film for best results
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 text-left animate-fade-in-up">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="text-lg flex-shrink-0">&#128247;</div>
              <div>
                <p className="text-xs font-bold text-white/80 mb-0.5">Camera Position</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  Stand perpendicular to the mound (directly to the side). Camera should be at waist height, 15-20 feet away. The pitcher should be visible head to toe in the frame.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="text-lg flex-shrink-0">&#127916;</div>
              <div>
                <p className="text-xs font-bold text-white/80 mb-0.5">Use Slow Motion (240fps)</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  <strong className="text-white/70">This is the #1 thing you can do for accuracy.</strong> On iPhone: open Camera &rarr; swipe to Slo-Mo &rarr; record. On Android: open Camera &rarr; More &rarr; Slow Motion. 240fps gives us 8x more data than regular video — the difference between guessing and knowing at MER.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="text-lg flex-shrink-0">&#128161;</div>
              <div>
                <p className="text-xs font-bold text-white/80 mb-0.5">Lighting</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  Good lighting makes a huge difference. Outdoor daylight is best. Avoid filming with the sun directly behind the pitcher (backlit).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="text-lg flex-shrink-0">&#9989;</div>
              <div>
                <p className="text-xs font-bold text-white/80 mb-0.5">Best Practices</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  Film a single pitch (3-8 seconds). Avoid zooming in/out during the pitch. Trim the video so it starts just before the windup. Minimal background movement helps accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
