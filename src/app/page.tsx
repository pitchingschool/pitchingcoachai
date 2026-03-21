import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="text-xl font-bold tracking-tight">
          PitchingCoach<span className="text-brand-red">AI</span>
        </div>
        <a
          href="https://pitchingcoachai.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-white/80 hover:text-white transition-colors"
        >
          Book a Lesson &rarr;
        </a>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-16 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
          Find Out Exactly What&apos;s Wrong With Your Pitching Mechanics
          <span className="text-brand-red"> &mdash; Free</span>
        </h1>
        <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
          Upload a 10-second video. Get a full biomechanical breakdown in under
          60 seconds. No app download. No account needed.
        </p>
        <Link
          href="/analyze"
          className="inline-block bg-brand-red hover:bg-red-700 text-white font-bold text-lg px-10 py-4 rounded-xl transition-colors"
        >
          Analyze My Mechanics &rarr;
        </Link>
      </section>

      {/* Social proof */}
      <section className="flex flex-wrap justify-center gap-4 px-6 pb-16 max-w-3xl mx-auto">
        <div className="text-sm text-white/50 bg-white/5 border border-white/10 rounded-full px-5 py-2">
          2,400+ pitchers analyzed
        </div>
        <div className="text-sm text-white/50 bg-white/5 border border-white/10 rounded-full px-5 py-2">
          Ages 10&ndash;22
        </div>
        <div className="text-sm text-white/50 bg-white/5 border border-white/10 rounded-full px-5 py-2">
          Free forever
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "1",
              icon: "🎥",
              title: "Upload your video",
              desc: "Side-view pitching video, 10\u201330 seconds. Phone camera is fine.",
            },
            {
              step: "2",
              icon: "🤖",
              title: "AI detects your mechanics",
              desc: "Our AI tracks 33 body landmarks through every frame of your delivery.",
            },
            {
              step: "3",
              icon: "📊",
              title: "Get your full report",
              desc: "Scores, fix-it priorities, drill recommendations \u2014 in under 60 seconds.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-xs text-brand-red font-bold mb-2">
                STEP {item.step}
              </div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trusted by */}
      <section className="px-6 py-12 text-center">
        <p className="text-sm text-white/30">
          Trusted by travel ball coaches and parents across Ohio
        </p>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/10 text-center">
        <p className="text-sm text-white/40">
          Built by{" "}
          <a
            href="https://pitchingcoachai.com"
            className="text-white/60 hover:text-white underline"
          >
            Mike Grady
          </a>
          , Pitching Coach &middot; Grady&apos;s Pitching School &middot; North
          Canton, OH
        </p>
      </footer>
    </div>
  );
}
