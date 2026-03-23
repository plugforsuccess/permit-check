"use client";

import { useState } from "react";
import type { Permit } from "@/types";

interface PermitTableProps {
  permits: Permit[];
  isBlurred?: boolean;
}

const statusStyles: Record<string, string> = {
  Issued: "border-l-2 border-green-500 bg-green-50 text-green-800",
  Expired: "border-l-2 border-red-400 bg-red-50 text-red-700",
  "In Review": "border-l-2 border-yellow-400 bg-yellow-50 text-yellow-800",
  Finaled: "border-l-2 border-blue-400 bg-blue-50 text-blue-800",
  Void: "border-l-2 border-gray-300 bg-gray-50 text-gray-500",
  Pending: "border-l-2 border-yellow-400 bg-yellow-50 text-yellow-800",
  Unknown: "border-l-2 border-gray-200 bg-gray-50 text-gray-400",
};

const mobileStatusStyles: Record<string, string> = {
  Issued: "bg-green-100 text-green-800",
  Expired: "bg-red-100 text-red-700",
  "In Review": "bg-yellow-100 text-yellow-800",
  Finaled: "bg-blue-100 text-blue-800",
  Void: "bg-gray-100 text-gray-500",
  Pending: "bg-yellow-100 text-yellow-800",
  Unknown: "bg-gray-100 text-gray-400",
};

export default function PermitTable({
  permits,
  isBlurred = false,
}: PermitTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (permits.length === 0 && !isBlurred) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl">
        <div className="text-4xl mb-4">&#128203;</div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          No Permit Records Found
        </h3>
        <p className="text-gray-500 max-w-md mx-auto">
          No permit records were found for this address in the City of
          Atlanta&apos;s database. This may indicate no permits have been filed,
          or records may exist under a different address format.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative ${isBlurred ? "select-none" : ""}`} aria-hidden={isBlurred}>
      {isBlurred && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
          <div className="text-center p-8">
            <div className="text-3xl mb-3">&#128274;</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Search Complete
            </h3>
            <p className="text-gray-600 mb-4">
              Unlock the full permit history report for this address
            </p>
          </div>
        </div>
      )}

      {/* Mobile cards — shown on small screens */}
      <div className="md:hidden space-y-2">
        {permits.map((permit, index) => (
          <div
            key={permit.id || index}
            className="bg-white border border-gray-200 rounded-xl p-4"
            style={{ animation: `fadeIn 0.2s ease both ${index * 0.05}s` }}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-mono text-sm font-medium text-gray-900">
                {permit.record_number}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${mobileStatusStyles[permit.status] || mobileStatusStyles.Unknown}`}
              >
                {permit.status}
              </span>
            </div>
            <div className="text-sm text-gray-700 mb-1">{permit.type}</div>
            {permit.module && permit.module !== "Building" && (
              <span className="inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full mb-1">
                {permit.module}
              </span>
            )}
            {permit.description && (
              <div className="text-xs text-gray-500 mb-2 leading-relaxed line-clamp-2">
                {permit.description}
              </div>
            )}
            <div className="text-xs text-gray-400">
              Filed: {permit.filed_date || "\u2014"}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table — hidden on small screens */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-[#0f1f3d] sticky top-0 z-10">
            <tr>
              {[
                "Record #",
                "Type",
                "Module",
                "Status",
                "Filed Date",
                "Issued Date",
                "Description",
                "Contractor",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {permits.map((permit, index) => (
              <tr
                key={permit.id || index}
                className="hover:bg-gray-50 transition-colors"
                style={{ animation: `fadeIn 0.2s ease both ${index * 0.05}s` }}
              >
                <td className="px-4 py-3 text-sm font-mono text-gray-900">
                  {permit.record_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {permit.type}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {permit.module ?? "Building"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2.5 py-0.5 text-xs font-semibold ${statusStyles[permit.status] || statusStyles.Unknown}`}
                  >
                    {permit.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.filed_date || "\u2014"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.issued_date || "\u2014"}
                </td>
                <td
                  className="px-4 py-3 text-sm text-gray-600 max-w-xs cursor-pointer hover:text-gray-900 transition-colors"
                  onClick={() => toggleExpanded(permit.record_number)}
                  title={permit.description ? "Click to expand" : undefined}
                >
                  {expanded.has(permit.record_number)
                    ? permit.description || "\u2014"
                    : (permit.description?.slice(0, 60) ?? "\u2014") +
                      ((permit.description?.length ?? 0) > 60 ? "..." : "")}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.contractor || "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status legend — shown only for unlocked results */}
      {!isBlurred && permits.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Issued = Approved by city</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Finaled = Completed &amp; inspected</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" />In Review = Pending approval</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Expired = No longer valid</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" />Void = Cancelled</span>
        </div>
      )}
    </div>
  );
}
