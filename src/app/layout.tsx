import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  title: "PitchingCoachAI — Free AI Pitching Mechanics Analysis",
  description:
    "Upload a pitching video. Get a full biomechanical breakdown with grades, drill prescriptions, and injury risk flags in under 60 seconds. Free. No app download. Works on any device.",
  keywords: [
    "pitching mechanics",
    "pitching analysis",
    "baseball pitching",
    "AI pitching coach",
    "biomechanics",
    "pitching drills",
    "youth baseball",
    "travel baseball",
  ],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "PitchingCoachAI — Free AI Pitching Mechanics Analysis",
    description:
      "Upload a video. Get your mechanics report in 60 seconds. Grades, drill prescriptions, and injury risk flags. No download required.",
    url: "https://pitchingcoachai.com",
    siteName: "PitchingCoachAI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PitchingCoachAI — Free AI Pitching Mechanics Analysis",
    description:
      "Upload a pitching video. Get grades, drills, and injury flags in 60 seconds.",
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL("https://pitchingcoachai.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* JSON-LD Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "PitchingCoachAI",
              description: "Free AI pitching mechanics analysis tool. Upload a video, get grades, drill prescriptions, and injury risk flags in 60 seconds.",
              url: "https://pitchingcoachai.com",
              applicationCategory: "SportsApplication",
              operatingSystem: "Any",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              author: {
                "@type": "Person",
                name: "Mike Grady",
                jobTitle: "Pitching Coach",
                worksFor: {
                  "@type": "SportsOrganization",
                  name: "Grady's Pitching School",
                  address: {
                    "@type": "PostalAddress",
                    addressLocality: "North Canton",
                    addressRegion: "OH",
                    addressCountry: "US",
                  },
                },
              },
            }),
          }}
        />
      </head>
      <body className={`${inter.className} antialiased bg-[#0a0a0a] text-white`}>{children}</body>
    </html>
  );
}
