"use client";

import { Fragment, useState } from "react";
import type { Permit } from "@/types";

interface PermitTableProps {
  permits: Permit[];
  isBlurred?: boolean;
}

const statusStyles: Record<string, string> = {
  Issued:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  Expired:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 ring-1 ring-red-200",
  "In Review":
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  Finaled:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  Void:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500 ring-1 ring-gray-200",
  Pending:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  Unknown:
    "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-400 ring-1 ring-gray-200",
};

const mobileStatusStyles: Record<string, string> = {
  Issued: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  Expired: "bg-red-100 text-red-800 ring-1 ring-red-200",
  "In Review": "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  Finaled: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  Void: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
  Pending: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  Unknown: "bg-gray-100 text-gray-400 ring-1 ring-gray-200",
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
            className={`bg-white rounded-xl p-4 border-l-4 border border-gray-100 hover:shadow-sm transition-all duration-150 ${
              permit.status === "Expired" ? "border-l-red-400" :
              permit.status === "Issued" ? "border-l-emerald-400" :
              permit.status === "Finaled" ? "border-l-blue-400" :
              permit.status === "In Review" || permit.status === "Pending" ? "border-l-amber-400" :
              "border-l-gray-200"
            }`}
            style={{ animation: `fadeInUp 0.3s ease both ${index * 0.04}s` }}
          >
            {/* Row 1: Type + Status */}
            <div className="flex items-start justify-between mb-1.5">
              <span className="text-sm font-semibold text-gray-900 leading-tight flex-1 mr-2">
                {permit.type}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${mobileStatusStyles[permit.status] || mobileStatusStyles.Unknown}`}
              >
                {permit.status}
              </span>
            </div>
            {/* Row 2: Record number */}
            <span className="font-mono text-xs text-gray-400 block mb-1">
              {permit.record_number}
            </span>
            {permit.description && (
              <div className="text-xs text-gray-500 mb-2 leading-relaxed line-clamp-2">
                {permit.description}
              </div>
            )}
            <div className="text-xs text-gray-400">
              Filed: {permit.filed_date || "\u2014"}
            </div>
            {permit.inspection_history &&
              permit.inspection_history.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Inspections
                  </div>
                  <div className="space-y-1">
                    {permit.inspection_history.map((insp, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            insp.result === "Passed"
                              ? "bg-green-500"
                              : insp.result === "Failed"
                                ? "bg-red-500"
                                : insp.result === "Canceled"
                                  ? "bg-gray-400"
                                  : "bg-yellow-400"
                          }`}
                        />
                        <span className="text-gray-600">
                          {insp.inspectionType}
                        </span>
                        <span
                          className={`font-medium ${
                            insp.result === "Passed"
                              ? "text-green-700"
                              : insp.result === "Failed"
                                ? "text-red-700"
                                : "text-gray-500"
                          }`}
                        >
                          {insp.result}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>

      {/* Desktop table — hidden on small screens */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-[#0f1f3d]">
            <tr>
              {["Record #", "Type", "Module", "Status", "Filed Date", "Issued Date", "Description"].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider first:rounded-tl-xl last:rounded-tr-xl"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {permits.map((permit, index) => {
              const hasInspections =
                permit.inspection_history &&
                permit.inspection_history.length > 0;
              const isExpanded = expanded.has(permit.record_number);
              return (
                <Fragment key={permit.id || index}>
                  <tr
                    className="hover:bg-[#0f1f3d]/[0.02] transition-colors duration-150 cursor-default"
                    style={{
                      animation: `fadeInUp 0.3s ease both ${index * 0.04}s`,
                    }}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      <span className="flex items-center gap-1.5">
                        {permit.record_number}
                        {hasInspections && (
                          <button
                            onClick={() =>
                              toggleExpanded(permit.record_number)
                            }
                            className="text-gray-400 hover:text-gray-700 transition-colors"
                            title="Toggle inspection history"
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {permit.type}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {permit.module ?? "Building"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusStyles[permit.status] || statusStyles.Unknown}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          permit.status === "Issued" ? "bg-emerald-500" :
                          permit.status === "Finaled" ? "bg-blue-500" :
                          permit.status === "Expired" ? "bg-red-500" :
                          permit.status === "In Review" || permit.status === "Pending" ? "bg-amber-500" :
                          "bg-gray-400"
                        }`} />
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
                      onClick={() =>
                        !hasInspections &&
                        toggleExpanded(permit.record_number)
                      }
                      title={
                        permit.description ? "Click to expand" : undefined
                      }
                    >
                      {expanded.has(permit.record_number) || hasInspections
                        ? permit.description || "\u2014"
                        : (permit.description?.slice(0, 60) ?? "\u2014") +
                          ((permit.description?.length ?? 0) > 60
                            ? "..."
                            : "")}
                    </td>
                  </tr>
                  {hasInspections && isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-3 pt-0">
                        <div className="ml-2 pl-3 border-l-2 border-gray-100">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Inspection History
                          </div>
                          <div className="space-y-1">
                            {permit.inspection_history!.map((insp, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 text-xs"
                              >
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    insp.result === "Passed"
                                      ? "bg-green-500"
                                      : insp.result === "Failed"
                                        ? "bg-red-500"
                                        : insp.result === "Canceled"
                                          ? "bg-gray-400"
                                          : "bg-yellow-400"
                                  }`}
                                />
                                <span className="text-gray-700 font-medium">
                                  {insp.inspectionType}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    insp.result === "Passed"
                                      ? "text-green-700"
                                      : insp.result === "Failed"
                                        ? "text-red-700"
                                        : "text-gray-500"
                                  }`}
                                >
                                  {insp.result}
                                </span>
                                {insp.inspectedDate && (
                                  <span className="text-gray-400">
                                    {insp.inspectedDate}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
