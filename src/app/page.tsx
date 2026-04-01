"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { analytics } from "@/lib/analytics";

function useAnalysisCount() {
  const [count, setCount] = useState(2400);
  useEffect(() => {
    fetch("/api/count")
      .then((r) => r.json())
      .then((d) => { if (d.count) setCount(d.count); })
      .catch(() => {});
  }, []);
  return count;
}

function SampleReport() {
  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 max-w-md mx-auto text-left shadow-2xl shadow-red-500/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Mechanics Report</p>
          <p className="text-sm font-bold">Sample Pitcher, Age 14</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-brand-red leading-none">84</div>
          <div className="text-xs text-white/40">Overall B</div>
        </div>
      </div>

      {/* Phase grades row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { phase: "Drift", grade: "B", score: 82 },
          { phase: "FFS", grade: "A", score: 91 },
          { phase: "MER", grade: "C", score: 74 },
          { phase: "Release", grade: "B", score: 86 },
        ].map((p) => (
          <div key={p.phase} className="bg-white/5 rounded-lg py-2 text-center">
            <div className="text-[10px] text-white/40 uppercase">{p.phase}</div>
            <div className={`text-lg font-black ${p.grade === "A" ? "text-green-400" : p.grade === "B" ? "text-blue-400" : "text-yellow-400"}`}>
              {p.grade}
            </div>
          </div>
        ))}
      </div>

      {/* Sample metrics */}
      <div className="space-y-2 mb-4">
        {[
          { label: "Hip-Shoulder Separation", value: "42\u00b0", grade: "A", color: "text-green-400" },
          { label: "Stride Length", value: "81%", grade: "B", color: "text-blue-400" },
          { label: "Arm Timing at FFS", value: "Late", grade: "C", color: "text-yellow-400" },
        ].map((m) => (
          <div key={m.label} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
            <span className="text-xs text-white/60">{m.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-white/80">{m.value}</span>
              <span className={`text-xs font-bold ${m.color}`}>{m.grade}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Drill preview */}
      <div className="bg-brand-red/10 border border-brand-red/20 rounded-lg px-3 py-2">
        <p className="text-[10px] text-brand-red uppercase font-bold tracking-wider mb-1">Top Drill</p>
        <p className="text-xs text-white/80">Mirror Work + T-Position Rocker</p>
        <p className="text-[10px] text-white/40">10 slow-motion reps, then 10 throws at 75%</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const analysisCount = useAnalysisCount();

  useEffect(() => {
    analytics.pageView("home");
  }, []);

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="text-xl font-bold tracking-tight">
          PitchingCoach<span className="text-brand-red">AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/analyze" className="text-sm font-medium text-white/80 hover:text-white transition-colors hidden sm:block">
            Analyze
          </Link>
          <a
            href="https://gradyspitchingschool.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-red hover:text-red-400 transition-colors"
          >
            Book a Lesson &rarr;
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-12 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div className="text-center lg:text-left">
            <div className="inline-block bg-brand-red/10 border border-brand-red/30 rounded-full px-4 py-1.5 text-xs font-bold text-brand-red uppercase tracking-wider mb-6 animate-fade-in-up">
              Free &middot; No Download &middot; Any Device
            </div>
            <h1 className="text-4xl md:text-5xl font-black leading-[1.1] mb-6 animate-fade-in-up-delay-1">
              Find Out Exactly What&apos;s Wrong With Your Pitching Mechanics
            </h1>
            <p className="text-lg text-white/60 mb-8 max-w-lg mx-auto lg:mx-0 animate-fade-in-up-delay-2">
              Upload a 10-second side-view video. Get a full biomechanical
              breakdown with grades, drill prescriptions, and injury risk
              flags &mdash; in under 60 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start animate-fade-in-up-delay-3">
              <Link
                href="/analyze"
                className="inline-block bg-brand-red hover:bg-red-700 text-white font-bold text-lg px-10 py-4 rounded-xl transition-all text-center glow-red hover:scale-[1.02]"
              >
                Analyze My Mechanics &rarr;
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 mt-8 justify-center lg:justify-start">
              <div>
                <div className="text-2xl font-black">{analysisCount.toLocaleString()}+</div>
                <div className="text-xs text-white/40">Pitchers Analyzed</div>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <div className="text-2xl font-black">Ages 10&ndash;22</div>
                <div className="text-xs text-white/40">Youth to College</div>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <div className="text-2xl font-black">100%</div>
                <div className="text-xs text-white/40">Free Forever</div>
              </div>
            </div>
          </div>

          {/* Right: sample report */}
          <div className="hidden md:block">
            <SampleReport />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-3">How It Works</h2>
        <p className="text-sm text-white/40 text-center mb-12 max-w-md mx-auto">
          No app to download. No account to create. Just upload and go.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              icon: "\ud83c\udfa5",
              title: "Upload Your Video",
              desc: "Side-view pitching video, 3\u201310 seconds. Phone camera is fine. MP4, MOV, AVI, or WebM.",
            },
            {
              step: "2",
              icon: "\ud83e\udde0",
              title: "AI Analyzes Your Delivery",
              desc: "Our AI tracks 33 body landmarks through every frame. Your video never leaves your device.",
            },
            {
              step: "3",
              icon: "\ud83d\udcca",
              title: "Get Your Full Report",
              desc: "Phase-by-phase grades, metric breakdowns, and up to 5 targeted drill prescriptions.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center hover:border-white/10 transition-colors"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-xs text-brand-red font-bold mb-2 tracking-wider">
                STEP {item.step}
              </div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-3">What&apos;s in Your Report</h2>
        <p className="text-sm text-white/40 text-center mb-12 max-w-md mx-auto">
          Same phases the best pitching coaches in the country are looking at.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              phase: "Leg Lift",
              desc: "Balance point, knee height, and posture at the top of the delivery",
              color: "border-purple-500/30",
            },
            {
              phase: "Drift",
              desc: "Hip lead and forward momentum initiation toward the plate",
              color: "border-blue-500/30",
            },
            {
              phase: "Foot Strike",
              desc: "Stride length, arm timing, and hip-shoulder separation at landing",
              color: "border-green-500/30",
            },
            {
              phase: "MER",
              desc: "Maximum external rotation \u2014 shoulder layback, elbow height, injury risk",
              color: "border-yellow-500/30",
            },
            {
              phase: "Release",
              desc: "Trunk flexion, lead leg brace, and arm slot at ball release",
              color: "border-red-500/30",
            },
          ].map((p) => (
            <div key={p.phase} className={`bg-white/[0.03] border ${p.color} rounded-xl p-5`}>
              <h3 className="font-bold mb-1.5 text-sm">{p.phase}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <p className="text-sm text-white/40 mb-1">Plus: personalized drill prescriptions and injury risk flags</p>
          <p className="text-xs text-white/30">Grading benchmarked against ASMI and Driveline research data</p>
        </div>
      </section>

      {/* Mobile sample report (shown only on small screens) */}
      <section className="px-6 py-8 md:hidden">
        <h2 className="text-lg font-bold text-center mb-4">Sample Report</h2>
        <SampleReport />
      </section>

      {/* Credentials */}
      <section className="px-6 py-16 max-w-3xl mx-auto text-center">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 md:p-12">
          <p className="text-xs text-brand-red uppercase tracking-wider font-bold mb-4">Built by a Real Pitching Coach</p>
          <h2 className="text-2xl font-bold mb-4">
            Mike Grady &middot; Grady&apos;s Pitching School
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg mx-auto mb-6">
            20 years of coaching experience. 100+ active pitchers from 10U travel ball
            through college programs. Based in North Canton, OH. This tool is built
            on the same methodology Mike uses in the facility every day &mdash; focused
            on the drift move, foot strike timing, max external rotation, and release
            mechanics that actually matter for velocity and arm health.
          </p>
          <p className="text-xs text-white/30">
            Not a generic app built by developers who&apos;ve never coached. Real coaching philosophy, powered by AI.
          </p>
        </div>
      </section>

      {/* Why PitchingCoachAI vs Others */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-3">Why Pitchers Choose Us</h2>
        <p className="text-sm text-white/40 text-center mb-12 max-w-md mx-auto">
          Built different from every other analysis tool on the market.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "\ud83c\udf10",
              title: "Works on Any Device",
              desc: "No iOS app to download, no account to create. Upload from your phone, tablet, or laptop. Android, iPhone, Chrome, Safari \u2014 all supported.",
              highlight: "vs. Mustard (iOS only)",
            },
            {
              icon: "\ud83d\udd12",
              title: "Your Video Stays Private",
              desc: "All analysis happens in your browser. Your video is never uploaded to a server. We can\u2019t see it, store it, or share it.",
              highlight: "100% client-side processing",
            },
            {
              icon: "\ud83c\udfa4",
              title: "Real Coach, Real Methodology",
              desc: "Grading thresholds set by a coach with 20 years of experience \u2014 not software engineers guessing at what good mechanics look like.",
              highlight: "ASMI + Driveline informed",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-white/10 transition-colors"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="text-base font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50 mb-3">{item.desc}</p>
              <p className="text-xs text-brand-red font-medium">{item.highlight}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-3">Frequently Asked Questions</h2>
        <p className="text-sm text-white/40 text-center mb-10">
          Everything parents and coaches want to know.
        </p>
        <div className="space-y-4">
          {[
            {
              q: "What kind of video do I need?",
              a: "A side-view (perpendicular to the pitching direction) video showing the pitcher from head to toe. Phone camera is fine \u2014 3 to 10 seconds, any format (MP4, MOV, AVI, WebM). Higher frame rate (60fps) gives better results, but 30fps works too.",
            },
            {
              q: "Is it really free? What\u2019s the catch?",
              a: "100% free, no limits. We built this as a tool for pitchers and as a way for coaches to connect with families who want expert help. If you want personalized coaching, Mike Grady offers in-person and virtual lessons.",
            },
            {
              q: "How accurate is AI analysis compared to a real coach?",
              a: "AI gives you objective data \u2014 angles, timing, positions. It\u2019s excellent at measuring what\u2019s happening. A real coach tells you WHY it\u2019s happening and builds a plan to fix it. Use both: AI for data, coach for development.",
            },
            {
              q: "Is my video uploaded to a server?",
              a: "No. Your video never leaves your device. All processing happens in your browser using on-device AI (MediaPipe). We never see, store, or have access to your video.",
            },
            {
              q: "What ages does this work for?",
              a: "Ages 10 through college. Grading thresholds automatically adjust based on the level you select (12U, 14U, High School, College, Pro) so a 12-year-old isn\u2019t graded against MLB standards.",
            },
            {
              q: "Can I use this for my whole team?",
              a: "Absolutely. There\u2019s no limit on how many videos you can analyze. Coaches run entire teams through it before practice to identify who needs work on what.",
            },
          ].map((faq) => (
            <details
              key={faq.q}
              className="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden"
            >
              <summary className="px-5 py-4 cursor-pointer text-sm font-medium flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                {faq.q}
                <svg
                  className="w-4 h-4 text-white/30 group-open:rotate-180 transition-transform flex-shrink-0 ml-3"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-4">
                <p className="text-sm text-white/50 leading-relaxed">{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-3">Who Uses PitchingCoachAI</h2>
        <p className="text-sm text-white/40 text-center mb-12 max-w-md mx-auto">
          Built for every level of the game.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "\u26be",
              title: "Travel Ball Parents",
              desc: "Get objective data on your kid's mechanics between lessons. Know exactly what to work on before the next session. No more guessing.",
            },
            {
              icon: "\ud83c\udfaf",
              title: "Pitching Coaches",
              desc: "Run your entire roster through in one practice. Identify which pitchers need arm timing work, who's leaking energy, and who's ready for more intensity.",
            },
            {
              icon: "\ud83c\udfc6",
              title: "High School & College Pitchers",
              desc: "Track your progress over time. See how your mechanics change as you develop. Bring data to your next coaching session.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center hover:border-white/10 transition-colors"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="text-base font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-16 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-black mb-4">
          Ready to See Your Mechanics?
        </h2>
        <p className="text-white/50 mb-8 max-w-md mx-auto">
          It takes 60 seconds. It&apos;s free. And it might change the way your pitcher trains.
        </p>
        <Link
          href="/analyze"
          className="inline-block bg-brand-red hover:bg-red-700 text-white font-bold text-lg px-10 py-4 rounded-xl transition-colors"
        >
          Analyze My Mechanics &rarr;
        </Link>
        <p className="text-xs text-white/30 mt-4">
          MP4, MOV, AVI, or WebM &middot; Under 100MB &middot; Side view recommended
        </p>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <div className="text-xl font-bold tracking-tight">
              PitchingCoach<span className="text-brand-red">AI</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/40">
              <Link href="/analyze" className="hover:text-white transition-colors">
                Analyze
              </Link>
              <a
                href="https://gradyspitchingschool.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Book a Lesson
              </a>
              <a
                href="mailto:mike@gradyspitchingschool.com"
                className="hover:text-white transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-white/40">
              Built by{" "}
              <a
                href="https://gradyspitchingschool.com"
                className="text-white/60 hover:text-white underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mike Grady
              </a>
              , Pitching Coach &middot; Grady&apos;s Pitching School &middot; North
              Canton, OH
            </p>
            <p className="text-xs text-white/20 mt-2">
              Grading informed by ASMI, Driveline, and Fleisig biomechanical research
            </p>
            <p className="text-xs text-white/15 mt-1">
              &copy; {new Date().getFullYear()} PitchingCoachAI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
