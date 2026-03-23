interface PermitTeaserProps {
  permitCount: number;
  statusBreakdown: Record<string, number>;
  hasComplaints: boolean;
  hasExpired: boolean;
  isUnit: boolean;
}

const STATUS_ORDER = [
  "Issued",
  "Finaled",
  "In Review",
  "Expired",
  "Void",
  "Unknown",
];

const STATUS_COLORS: Record<string, string> = {
  Issued: "bg-green-100 text-green-800",
  Finaled: "bg-blue-100 text-blue-800",
  "In Review": "bg-yellow-100 text-yellow-800",
  Expired: "bg-red-100 text-red-700",
  Void: "bg-gray-100 text-gray-500",
  Unknown: "bg-gray-100 text-gray-400",
};

export default function PermitTeaser({
  permitCount,
  statusBreakdown,
  hasComplaints,
  hasExpired,
  isUnit,
}: PermitTeaserProps) {
  const sortedStatuses = STATUS_ORDER.filter(
    (s) => statusBreakdown[s] && statusBreakdown[s] > 0
  );

  return (
    <div className="mb-6">
      {/* Permit count header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900">
          {permitCount} permit record{permitCount !== 1 ? "s" : ""} found
        </h2>
        {isUnit && (
          <span className="text-xs text-gray-400 italic">
            Unit address — includes building-level permits
          </span>
        )}
      </div>

      {/* Status breakdown pills or zero-permit message */}
      {permitCount === 0 ? (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-600">
            No permit records found at this address in the official database.
            {isUnit
              ? " For condos and townhomes, this is often normal — permits are filed at the building level."
              : " Unlock the full report to see the AI analysis of what this means for this property."}
          </p>
        </div>
      ) : (
        <>
          {sortedStatuses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {sortedStatuses.map((status) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500"}`}
                >
                  <span className="font-bold">{statusBreakdown[status]}</span>
                  {status}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Risk signals */}
      {(hasComplaints || hasExpired) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {hasComplaints && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <svg
                className="w-4 h-4 text-red-500 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-sm font-semibold text-red-800">
                Building complaint on record
              </span>
            </div>
          )}
          {hasExpired && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
              <svg
                className="w-4 h-4 text-orange-500 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-semibold text-orange-800">
                Expired permit — work may not have been inspected
              </span>
            </div>
          )}
        </div>
      )}

      {/* What's included callout */}
      <div className="mb-4 p-3 bg-[#0f1f3d]/5 border border-[#0f1f3d]/10 rounded-lg">
        <p className="text-xs text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-800">Unlock to see:</span>{" "}
          Full permit details, record numbers, filing dates, descriptions,
          AI due diligence analysis, seller questions to ask, and PDF download.
        </p>
      </div>

      {/* Blurred table preview */}
      <div className="relative rounded-xl border border-gray-200 overflow-hidden">
        <div className="blur-sm select-none pointer-events-none">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-[#0f1f3d]">
              <tr>
                {["Record #", "Type", "Status", "Filed", "Description"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {Array.from({ length: Math.min(permitCount, 5) }).map(
                (_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {"BLD-XXXX-" + String(i + 1).padStart(5, "0")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {"\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {"\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {"\u2588\u2588/\u2588\u2588/\u2588\u2588\u2588\u2588"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {"\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588"}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
          <div className="text-center px-6">
            <div className="w-12 h-12 bg-[#0f1f3d] rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Unlock full report
            </p>
            <p className="text-xs text-gray-500">
              See all {permitCount} records + AI analysis
            </p>
          </div>
        </div>
      </div>

      {permitCount > 5 && (
        <p className="mt-2 text-xs text-gray-400 text-center">
          Showing preview of 5 of {permitCount} records
        </p>
      )}
    </div>
  );
}
