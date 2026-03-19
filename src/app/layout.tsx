import type { Metadata } from "next";
import "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "PermitCheck — Atlanta Property Permit Verification",
  description:
    "Instantly verify permit history for any Atlanta property. Check renovation permits, building permits, and more from the City of Atlanta's public records.",
  keywords: [
    "Atlanta permits",
    "property permits",
    "building permits",
    "permit check",
    "real estate due diligence",
    "Atlanta real estate",
    "unpermitted work",
    "permit verification",
  ],
  openGraph: {
    title: "PermitCheck — Atlanta Property Permit Verification",
    description:
      "Verify permit history for any Atlanta property before you buy.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen flex flex-col">
        <nav className="border-b border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/" className="text-xl font-bold text-blue-600">
                PermitCheck
              </a>
              <div className="flex items-center gap-6">
                <a
                  href="/#pricing"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Pricing
                </a>
                <a
                  href="/dashboard"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-100 py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
            <p>
              &copy; {new Date().getFullYear()} PermitCheck. All rights
              reserved.
            </p>
            <p className="mt-1">
              Data sourced from City of Atlanta public records. Not legal advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
