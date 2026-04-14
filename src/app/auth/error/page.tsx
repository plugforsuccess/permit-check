import Logo from "@/components/Logo";
import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <a href="/" className="inline-block mb-6">
          <Logo size="lg" variant="light" />
        </a>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-4xl mb-4">⏱</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            This link has expired
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Confirmation and reset links expire after 24 hours. Return to
            sign up or sign in to receive a new one.
          </p>
          <Link
            href="/dashboard"
            className="block w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] transition-colors text-center"
          >
            Back to sign in
          </Link>
        </div>

        <p className="text-center mt-6">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back to home
          </a>
        </p>
      </div>
    </div>
  );
}
