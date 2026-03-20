import type { Metadata } from "next";
import GoogleMapsProvider from "@/components/GoogleMapsProvider";
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
              <a href="/" className="flex items-center">
                <Logo size="md" variant="light" />
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
        <GoogleMapsProvider>
          <main className="flex-1">{children}</main>
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
