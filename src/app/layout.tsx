import type { Metadata } from "next";
import GoogleMapsProvider from "@/components/GoogleMapsProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Logo from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "PermitCheck — Property Permit Verification",
  description:
    "Instantly verify the permit history of any property. Search official government permit databases before you buy.",
  keywords: [
    "property permits",
    "building permits",
    "permit check",
    "permit history",
    "real estate due diligence",
    "unpermitted work",
    "permit verification",
  ],
  openGraph: {
    title: "PermitCheck — Property Permit Verification",
    description: "Verify permit history for any property before you buy.",
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
    "Instantly verify the permit history of any property. Search official government permit databases before you buy.",
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
        <nav className="border-b border-gray-100 bg-white" aria-label="Main navigation">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/" className="flex items-center">
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
                  href="/dashboard"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  Dashboard
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
        <footer className="border-t border-gray-100 py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
            <p>
              &copy; {new Date().getFullYear()} PermitCheck. All rights
              reserved.
            </p>
            <p className="mt-1">
              Data sourced from official government permit databases. Not legal advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
