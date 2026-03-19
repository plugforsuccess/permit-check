"use client";

import { DISCLAIMER } from "@/lib/config";

export default function Disclaimer() {
  return (
    <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs text-amber-900 leading-relaxed">{DISCLAIMER}</p>
    </div>
  );
}
