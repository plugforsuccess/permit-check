import type { Metadata } from "next";
import GoogleMapsProvider from "@/components/GoogleMapsProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Logo from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "PermitCheck — Where Serious Money Does Its Homework",
  description:
    "The permit intelligence platform for serious real estate investors. Instant address-level permit history before you commit capital.",
  keywords: [
    "permit check",
    "real estate due diligence",
    "property permit history",
    "investor due diligence",
    "building permits Atlanta",
    "unpermitted work",
    "permit verification",
    "real estate investing",
    "permit intelligence",
    "pre-closing due diligence",
  ],
  openGraph: {
    title: "PermitCheck — Property Permit Verification",
    description: "Where serious money does its homework. Instant permit intelligence before you commit capital.",
    type: "website",
    url: "https://permitcheck.org",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PermitCheck",
  url: "https://permitcheck.org",
  description:
    "The permit intelligence platform for serious real estate investors. Instant address-level permit history before you commit capital.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "9.99",
    priceCurrency: "USD",
    description: "One-time property permit report",
  },
  provider: {
    "@type": "Organization",
    name: "PermitCheck",
    url: "https://permitcheck.org",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body className="min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#0f1f3d] focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold"
        >
          Skip to main content
        </a>
        <nav
          className="sticky top-0 z-50 border-b border-white/10 bg-white/80 backdrop-blur-md"
          style={{ WebkitBackdropFilter: "blur(12px)" }}
          aria-label="Main navigation"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/" className="flex items-center group">
                <Logo size="md" variant="light" />
              </a>
              <div className="flex items-center gap-1">
                <a
                  href="/#pricing"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  Pricing
                </a>
                <a
                  href="/subscribe"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#0f1f3d] bg-[#c9a84c]/10 hover:bg-[#c9a84c]/20 px-3 py-2 rounded-lg transition-colors"
                >
                  Agent Plan
                </a>
                <a
                  href="/dashboard"
                  className="text-sm font-medium text-white bg-[#0f1f3d] hover:bg-[#1a3560] px-4 py-2 rounded-lg transition-colors ml-1"
                >
                  Sign In
                </a>
              </div>
            </div>
          </div>
        </nav>
        <GoogleMapsProvider>
          <main id="main-content" className="flex-1">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </GoogleMapsProvider>
        <footer className="border-t border-gray-100 bg-white mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid sm:grid-cols-3 gap-8 mb-8">

              {/* Brand column */}
              <div>
                <Logo size="md" variant="light" className="mb-3" />
                <p className="text-sm text-gray-500 leading-relaxed">
                  Where serious money does its homework.
                  Atlanta Metro · Gwinnett County · expanding.
                </p>
              </div>

              {/* Product column */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Product
                </div>
                <ul className="space-y-2">
                  <li>
                    <a href="/#pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                      Pricing
                    </a>
                  </li>
                  <li>
                    <a href="/subscribe" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                      Agent Plan
                    </a>
                  </li>
                  <li>
                    <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                      Sign In
                    </a>
                  </li>
                </ul>
              </div>

              {/* Trust column */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Data & Trust
                </div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-gray-500">
                    <span className="text-[#c9a84c] mt-0.5 shrink-0">&#10003;</span>
                    Official Accela government database
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-500">
                    <span className="text-[#c9a84c] mt-0.5 shrink-0">&#10003;</span>
                    City of Atlanta &amp; Gwinnett County
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-500">
                    <span className="text-[#c9a84c] mt-0.5 shrink-0">&#10003;</span>
                    Records updated in real time
                  </li>
                </ul>
              </div>

            </div>

            {/* Bottom bar */}
            <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-gray-400">
                &copy; {new Date().getFullYear()} PermitCheck. All rights reserved.
              </p>
              <p className="text-xs text-gray-400 text-center">
                Data sourced from official government Accela databases. Not a substitute for professional inspection or legal advice.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
