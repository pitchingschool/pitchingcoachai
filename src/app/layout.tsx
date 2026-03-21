import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PitchingCoachAI — Free Pitching Mechanics Analysis",
  description:
    "Upload a 10-second video. Get a full biomechanical breakdown in under 60 seconds. Built by Mike Grady, Grady's Pitching School.",
  openGraph: {
    title: "PitchingCoachAI — Free Pitching Mechanics Analysis",
    description: "Upload a video. Get your mechanics report in 60 seconds.",
    url: "https://pitchingcoachai.com",
    siteName: "PitchingCoachAI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
