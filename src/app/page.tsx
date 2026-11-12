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

function SectionHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="text-center mb-12">
      <p className="text-[11px] text-brand-red font-bold uppercase tracking-[0.2em] mb-2">{eyebrow}</p>
      <h2 className="font-display text-3xl md:text-4xl font-semibold uppercase tracking-wide text-gradient mb-3">
        {title}
      </h2>
      <p className="text-sm text-white/40 max-w-md mx-auto">{sub}</p>
    </div>
  );
}

function SampleReport() {
  const ringC = 2 * Math.PI * 20;
  return (
    <div className="glass-card rounded-2xl p-5 max-w-md mx-auto text-left shadow-2xl shadow-red-500/10 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Mechanics Report</p>
          <p className="text-sm font-bold">Sample Pitcher, Age 14</p>
        </div>
        <div className="relative w-14 h-14">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            <circle
              cx="24" cy="24" r="20" fill="none"
              stroke="#dc2626" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${ringC * 0.84} ${ringC}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-black text-white leading-none">84</span>
            <span className="text-[8px] text-white/40 font-bold">B</span>
          </div>
        </div>
      </div>

      {/* Phase grades row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { phase: "Leg Lift", grade: "B", score: 82 },
          { phase: "FFS", grade: "A", score: 91 },
          { phase: "Layback", grade: "C", score: 74 },
          { phase: "Release", grade: "B", score: 86 },
        ].map((p) => (
          <div key={p.phase} className="bg-white/5 border border-white/5 rounded-lg py-2 text-center">
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
          { label: "Hip-Shoulder Separation", value: "42°", grade: "A", color: "text-green-400", bar: "bg-green-400", width: "92%" },
          { label: "Stride Length", value: "81%", grade: "B", color: "text-blue-400", bar: "bg-blue-400", width: "78%" },
          { label: "Arm Timing at FFS", value: "Late", grade: "C", color: "text-yellow-400", bar: "bg-yellow-400", width: "55%" },
        ].map((m) => (
          <div key={m.label} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/60">{m.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-white/80">{m.value}</span>
                <span className={`text-xs font-bold ${m.color}`}>{m.grade}</span>
              </div>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.bar}`} style={{ width: m.width }} />
            </div>
          </div>
        ))}
      </div>

      {/* Drill preview */}
      <div className="bg-brand-red/10 border border-brand-red/25 rounded-lg px-3 py-2">
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
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#060606]/70 border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="text-xl font-bold tracking-tight">
            PitchingCoach<span className="text-brand-red">AI</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/analyze" className="text-sm font-medium text-white/80 hover:text-white transition-colors hidden sm:block">
              Analyze
            </Link>
            <a
              href="https://gradyspitchingschool.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-brand-red hover:text-red-400 transition-colors"
            >
              Book a Lesson &rarr;
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[320px] bg-brand-red/15 rounded-full blur-[120px] pointer-events-none animate-float" />
        <div className="relative px-6 pt-16 pb-14 max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-brand-red/10 border border-brand-red/30 rounded-full px-4 py-1.5 text-xs font-bold text-brand-red uppercase tracking-wider mb-6 animate-fade-in-up">
                <span className="relative flex h-2 w-2">
                  <span className="animate-soft-ping absolute inline-flex h-full w-full rounded-full bg-brand-red" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-red" />
                </span>
                Free &middot; No Download &middot; Any Device
              </div>
              <h1 className="font-display text-5xl md:text-7xl font-bold uppercase leading-[0.95] tracking-wide mb-6 animate-fade-in-up-delay-1">
                <span className="text-gradient">Find Out Exactly What&apos;s Wrong With Your</span>{" "}
                <span className="text-gradient-red">Pitching Mechanics</span>
              </h1>
              <p className="text-lg text-white/60 mb-8 max-w-lg mx-auto lg:mx-0 animate-fade-in-up-delay-2">
                Upload a 10-second side-view video. Get a full biomechanical
                breakdown with grades, drill prescriptions, and a clear list
                of what needs work, in under 60 seconds.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start animate-fade-in-up-delay-3">
                <Link
                  href="/analyze"
                  className="btn-primary inline-block text-white font-bold text-lg px-10 py-4 rounded-xl text-center"
                >
                  Analyze My Mechanics &rarr;
                </Link>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-6 mt-10 justify-center lg:justify-start">
                <div>
                  <div className="font-display text-3xl font-bold text-gradient-red">{analysisCount.toLocaleString()}+</div>
                  <div className="text-xs text-white/40">Pitchers Analyzed</div>
                </div>
                <div className="w-px bg-white/10" />
                <div>
                  <div className="font-display text-3xl font-bold">Ages 10&ndash;22</div>
                  <div className="text-xs text-white/40">Youth to College</div>
                </div>
                <div className="w-px bg-white/10" />
                <div>
                  <div className="font-display text-3xl font-bold">100%</div>
                  <div className="text-xs text-white/40">Free Forever</div>
                </div>
              </div>
            </div>

            {/* Right: sample report */}
            <div className="hidden md:block">
              <SampleReport />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="Three Steps"
          title="How It Works"
          sub="No app to download. No account to create. Just upload and go."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              icon: "🎥",
              title: "Upload Your Video",
              desc: "Side-view pitching video, 3–10 seconds. Phone camera is fine. MP4, MOV, AVI, or WebM.",
            },
            {
              step: "2",
              icon: "🧠",
              title: "AI Analyzes Your Delivery",
              desc: "Our AI tracks 33 body landmarks through every frame. Your video never leaves your device.",
            },
            {
              step: "3",
              icon: "📊",
              title: "Get Your Full Report",
              desc: "Phase-by-phase grades, metric breakdowns, and up to 5 targeted drill prescriptions.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="glass-card relative overflow-hidden rounded-2xl p-8 text-center"
            >
              <span className="absolute -top-3 right-2 font-display text-[88px] font-bold text-white/[0.04] leading-none select-none pointer-events-none">
                {item.step}
              </span>
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-xs text-brand-red font-bold mb-2 tracking-[0.2em]">
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
        <SectionHeader
          eyebrow="Phase by Phase"
          title="What's in Your Report"
          sub="Same phases the best pitching coaches in the country are looking at."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              phase: "Leg Lift",
              desc: "Balance point, knee height, and posture at the top of the delivery",
              bar: "bg-purple-400",
            },
            {
              phase: "Foot Strike",
              desc: "Stride length, arm timing, and hip-shoulder separation at landing",
              bar: "bg-green-400",
            },
            {
              phase: "Max Layback",
              desc: "How far the arm lays back, elbow bend, and arm height at peak load",
              bar: "bg-yellow-400",
            },
            {
              phase: "Release",
              desc: "Trunk flexion, lead leg brace, and arm slot at ball release",
              bar: "bg-red-400",
            },
            {
              phase: "Follow-Through",
              desc: "Deceleration path, finish balance, and how the arm slows down",
              bar: "bg-blue-400",
            },
          ].map((p, i) => (
            <div key={p.phase} className="glass-card relative overflow-hidden rounded-xl p-5 pt-6">
              <span className={`absolute top-0 left-0 right-0 h-[3px] ${p.bar} opacity-70`} />
              <p className="text-[10px] text-white/30 font-bold mb-1">PHASE {i + 1}</p>
              <h3 className="font-bold mb-1.5 text-sm">{p.phase}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <p className="text-sm text-white/40 mb-1">Plus: personalized drill prescriptions for every area that needs work</p>
          <p className="text-xs text-white/30">Grading benchmarked against ASMI and Driveline research data</p>
        </div>
      </section>

      {/* Mobile sample report (shown only on small screens) */}
      <section className="px-6 py-8 md:hidden">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-center mb-4">Sample Report</h2>
        <SampleReport />
      </section>

      {/* Credentials */}
      <section className="px-6 py-16 max-w-3xl mx-auto text-center">
        <div className="glass-card relative overflow-hidden rounded-2xl p-8 md:p-12">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[160px] bg-brand-red/10 rounded-full blur-[80px] pointer-events-none" />
          <p className="text-[11px] text-brand-red uppercase tracking-[0.2em] font-bold mb-4">Built by a Real Pitching Coach</p>
          <h2 className="font-display text-3xl font-semibold uppercase tracking-wide mb-4">
            Mike Grady &middot; Grady&apos;s Pitching School
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg mx-auto mb-6">
            20 years of coaching experience. 100+ active pitchers from 10U travel ball
            through college programs. Based in North Canton, OH. This tool is built
            on the same methodology Mike uses in the facility every day, focused
            on the leg lift, foot strike timing, max layback, and release
            mechanics that actually matter for velocity and arm health.
          </p>
          <p className="text-xs text-white/30">
            Not a generic app built by developers who&apos;ve never coached. Real coaching philosophy, powered by AI.
          </p>
        </div>
      </section>

      {/* Why PitchingCoachAI vs Others */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="The Difference"
          title="Why Pitchers Choose Us"
          sub="Built different from every other analysis tool on the market."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "🌐",
              title: "Works on Any Device",
              desc: "No iOS app to download, no account to create. Upload from your phone, tablet, or laptop. Android, iPhone, Chrome, Safari, all supported.",
              highlight: "vs. Mustard (iOS only)",
            },
            {
              icon: "🔒",
              title: "Your Video Stays Private",
              desc: "All analysis happens in your browser. Your video is never uploaded to a server. We can’t see it, store it, or share it.",
              highlight: "100% client-side processing",
            },
            {
              icon: "🎤",
              title: "Real Coach, Real Methodology",
              desc: "Grading thresholds set by a coach with 20 years of experience, not software engineers guessing at what good mechanics look like.",
              highlight: "ASMI + Driveline informed",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="glass-card rounded-2xl p-6"
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
        <SectionHeader
          eyebrow="Good Questions"
          title="Frequently Asked Questions"
          sub="Everything parents and coaches want to know."
        />
        <div className="space-y-4">
          {[
            {
              q: "What kind of video do I need?",
              a: "A side-view (perpendicular to the pitching direction) video showing the pitcher from head to toe. Phone camera is fine, 3 to 10 seconds, any format (MP4, MOV, AVI, WebM). Higher frame rate (60fps) gives better results, but 30fps works too.",
            },
            {
              q: "Is it really free? What’s the catch?",
              a: "100% free, no limits. We built this as a tool for pitchers and as a way for coaches to connect with families who want expert help. If you want personalized coaching, Mike Grady offers in-person and virtual lessons.",
            },
            {
              q: "How accurate is AI analysis compared to a real coach?",
              a: "AI gives you objective data, angles, timing, positions. It’s excellent at measuring what’s happening. A real coach tells you WHY it’s happening and builds a plan to fix it. Use both: AI for data, coach for development.",
            },
            {
              q: "Is my video uploaded to a server?",
              a: "No. Your video never leaves your device. All processing happens in your browser using on-device AI (MediaPipe). We never see, store, or have access to your video.",
            },
            {
              q: "What ages does this work for?",
              a: "Ages 10 through college. Grading thresholds automatically adjust based on the level you select (12U, 14U, High School, College, Pro) so a 12-year-old isn’t graded against MLB standards.",
            },
            {
              q: "Can I use this for my whole team?",
              a: "Absolutely. There’s no limit on how many videos you can analyze. Coaches run entire teams through it before practice to identify who needs work on what.",
            },
          ].map((faq) => (
            <details
              key={faq.q}
              className="group glass-card rounded-xl overflow-hidden"
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
        <SectionHeader
          eyebrow="Every Level"
          title="Who Uses PitchingCoachAI"
          sub="Built for every level of the game."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "⚾",
              title: "Travel Ball Parents",
              desc: "Get objective data on your kid's mechanics between lessons. Know exactly what to work on before the next session. No more guessing.",
            },
            {
              icon: "🎯",
              title: "Pitching Coaches",
              desc: "Run your entire roster through in one practice. Identify which pitchers need arm timing work, who's leaking energy, and who's ready for more intensity.",
            },
            {
              icon: "🏆",
              title: "High School & College Pitchers",
              desc: "Track your progress over time. See how your mechanics change as you develop. Bring data to your next coaching session.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="glass-card rounded-2xl p-6 text-center"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="text-base font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-brand-red/25 bg-gradient-to-br from-brand-red/15 via-[#140808] to-[#0a0606] p-10 md:p-14 text-center">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[200px] bg-brand-red/20 rounded-full blur-[100px] pointer-events-none" />
          <h2 className="relative font-display text-4xl md:text-5xl font-bold uppercase tracking-wide text-gradient mb-4">
            Ready to See Your Mechanics?
          </h2>
          <p className="relative text-white/50 mb-8 max-w-md mx-auto">
            It takes 60 seconds. It&apos;s free. And it might change the way your pitcher trains.
          </p>
          <Link
            href="/analyze"
            className="btn-primary relative inline-block text-white font-bold text-lg px-10 py-4 rounded-xl"
          >
            Analyze My Mechanics &rarr;
          </Link>
          <p className="relative text-xs text-white/30 mt-4">
            MP4, MOV, AVI, or WebM &middot; Under 100MB &middot; Side view recommended
          </p>
        </div>
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
