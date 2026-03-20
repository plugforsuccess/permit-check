"use client";

import { useState, FormEvent } from "react";

interface AddressSearchProps {
  onSearch: (address: string, reportType: "standard" | "attorney") => void;
  isLoading: boolean;
}

export default function AddressSearch({
  onSearch,
  isLoading,
}: AddressSearchProps) {
  const [address, setAddress] = useState("");
  const [reportType, setReportType] = useState<"standard" | "attorney">(
    "standard"
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = address.trim();
    if (!trimmed) {
      setError("Please enter an address");
      return;
    }

    if (!/^\d+/.test(trimmed)) {
      setError("Address must start with a street number");
      return;
    }

    if (trimmed.split(/\s+/).length < 2) {
      setError("Please enter a complete street address");
      return;
    }

    onSearch(trimmed, reportType);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          placeholder="Enter a property address (e.g., 130 Trinity Ave SW, Atlanta, GA)"
          className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900 placeholder-gray-400"
          disabled={isLoading}
          aria-label="Property address"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Searching...
            </span>
          ) : (
            "Search Permits"
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-red-600 text-sm font-medium">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-6 justify-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="reportType"
            value="standard"
            checked={reportType === "standard"}
            onChange={() => setReportType("standard")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            Standard Report{" "}
            <span className="font-semibold text-gray-900">$9.99</span>
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="reportType"
            value="attorney"
            checked={reportType === "attorney"}
            onChange={() => setReportType("attorney")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            Attorney Report{" "}
            <span className="font-semibold text-gray-900">$199</span>
          </span>
        </label>
      </div>
    </form>
  );
}
