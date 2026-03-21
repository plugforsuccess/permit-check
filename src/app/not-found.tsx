import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <Logo size="md" className="mb-8" />
      <div className="text-6xl font-bold text-gray-200 mb-4">404</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Page not found
      </h1>
      <p className="text-gray-500 mb-8 max-w-sm">
        This page doesn&apos;t exist or the link has expired.
        Permit reports expire after 48 hours.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0f1f3d] text-white text-sm font-medium rounded-lg hover:bg-[#1a3560] transition-colors"
      >
        Search a Property
      </Link>
    </div>
  );
}
