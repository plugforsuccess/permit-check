"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

interface EmailConfirmationPendingProps {
  email: string;
  onSignIn: () => void;
  onTryAgain: () => void;
}

export default function EmailConfirmationPending({
  email,
  onSignIn,
  onTryAgain,
}: EmailConfirmationPendingProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <Link href="/" className="inline-block mb-6">
          <Logo size="lg" variant="light" />
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="w-14 h-14 bg-[#0f1f3d]/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-[#0f1f3d]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Check your email
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            We sent a confirmation link to
          </p>
          <p className="text-sm font-semibold text-[#0f1f3d] mb-6">{email}</p>
          <p className="text-sm text-gray-500 mb-6">
            Click the link in the email to activate your account. Then come
            back here to sign in.
          </p>

          <button
            onClick={onSignIn}
            className="w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] transition-colors active:scale-[0.98]"
          >
            I confirmed my email — Sign in
          </button>

          <p className="mt-4 text-xs text-gray-400">
            Didn&apos;t receive it? Check your spam folder, or{" "}
            <button
              onClick={onTryAgain}
              className="text-[#0f1f3d] font-semibold hover:underline"
            >
              try again
            </button>
            .
          </p>
        </div>

        <p className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
