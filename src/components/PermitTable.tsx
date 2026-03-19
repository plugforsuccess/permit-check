"use client";

import type { Permit } from "@/types";

interface PermitTableProps {
  permits: Permit[];
  isBlurred?: boolean;
}

const statusStyles: Record<string, string> = {
  Issued: "bg-green-100 text-green-800",
  Expired: "bg-red-100 text-red-800",
  "In Review": "bg-yellow-100 text-yellow-800",
  Finaled: "bg-blue-100 text-blue-800",
  Void: "bg-gray-100 text-gray-600",
  Pending: "bg-yellow-100 text-yellow-800",
  Unknown: "bg-gray-100 text-gray-500",
};

export default function PermitTable({
  permits,
  isBlurred = false,
}: PermitTableProps) {
  if (permits.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl">
        <div className="text-4xl mb-4">📋</div>
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
    <div className={`relative ${isBlurred ? "select-none" : ""}`}>
      {isBlurred && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
          <div className="text-center p-8">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Results Ready
            </h3>
            <p className="text-gray-600 mb-4">
              Unlock the full permit history report
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-blue-600">
            <tr>
              {[
                "Record #",
                "Type",
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
              >
                <td className="px-4 py-3 text-sm font-mono text-gray-900">
                  {permit.record_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {permit.type}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles[permit.status] || statusStyles.Unknown}`}
                  >
                    {permit.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.filed_date || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.issued_date || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                  {permit.description || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permit.contractor || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
