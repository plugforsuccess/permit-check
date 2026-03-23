"use client";

interface ReferralCard {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  icon: "inspector" | "attorney" | "lender" | "contractor";
}

const iconMap: Record<string, JSX.Element> = {
  inspector: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  attorney: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  ),
  lender: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  contractor: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.107A1.5 1.5 0 005 13.423v4.154a1.5 1.5 0 001.036 1.43l5.384 1.795a1.5 1.5 0 00.948 0l5.384-1.795A1.5 1.5 0 0018.788 17.577v-4.154a1.5 1.5 0 00-1.036-1.36l-5.384-3.107a1.5 1.5 0 00-.948 0z" />
    </svg>
  ),
};

const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
  inspector: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-200" },
  attorney: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-purple-200" },
  lender: { bg: "bg-green-50", icon: "text-green-600", border: "border-green-200" },
  contractor: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-orange-200" },
};

export default function ReferralCards({ cards }: { cards: ReferralCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="mt-6 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        Recommended Next Steps
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((card) => {
          const colors = colorMap[card.icon] ?? colorMap.inspector;
          return (
            <a
              key={card.id}
              href={card.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`block p-4 rounded-lg border ${colors.border} ${colors.bg} hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 mt-0.5 ${colors.icon}`}>
                  {iconMap[card.icon]}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900">
                    {card.title}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    {card.description}
                  </p>
                  <span className="inline-block mt-2 text-xs font-semibold text-[#0f1f3d] hover:underline">
                    {card.cta} &rarr;
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
