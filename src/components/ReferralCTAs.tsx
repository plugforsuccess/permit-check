"use client";

interface ReferralCTAsProps {
  riskLevel: "low" | "medium" | "high";
  address: string;
}

interface ReferralCard {
  id: string;
  category: string;
  headline: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  showOn: Array<"low" | "medium" | "high">;
  icon: string;
}

// Update these URLs with your actual affiliate IDs before deploying
const REFERRAL_CARDS: ReferralCard[] = [
  {
    id: "attorney",
    category: "Legal",
    headline: "Speak with a real estate attorney",
    description:
      "Permit issues can affect your contract rights and negotiating position. Get a free 15-minute consultation.",
    ctaText: "Find an attorney \u2192",
    ctaUrl: "https://www.avvo.com/real-estate-lawyer.html",
    showOn: ["medium", "high"],
    icon: "\u2696\uFE0F",
  },
  {
    id: "inspector",
    category: "Inspection",
    headline: "Schedule a licensed home inspection",
    description:
      "Verify what work was actually done and whether it meets code \u2014 regardless of permits on file.",
    ctaText: "Find an inspector \u2192",
    ctaUrl: "https://www.homeadvisor.com/c.Home_Inspectors.html",
    showOn: ["medium", "high"],
    icon: "\uD83D\uDD0D",
  },
  {
    id: "contractor",
    category: "Remediation",
    headline: "Get a remediation estimate",
    description:
      "Expired permits may require re-inspection or corrective work. Get a free estimate before closing.",
    ctaText: "Find a contractor \u2192",
    ctaUrl: "https://www.homeadvisor.com/",
    showOn: ["high"],
    icon: "\uD83D\uDD27",
  },
  {
    id: "mortgage",
    category: "Financing",
    headline: "Compare mortgage rates",
    description:
      "Clean permit history means a smoother appraisal. Lock in your rate while due diligence is complete.",
    ctaText: "Compare rates \u2192",
    ctaUrl: "https://www.lendingtree.com/home/mortgage/",
    showOn: ["low"],
    icon: "\uD83C\uDFE6",
  },
  {
    id: "agent",
    category: "Buyer's Agent",
    headline: "Connect with a buyer's agent",
    description:
      "An experienced agent can help you negotiate permit issues into the purchase price or contract terms.",
    ctaText: "Find an agent \u2192",
    ctaUrl: "https://www.realtor.com/realestateagents/",
    showOn: ["low", "medium", "high"],
    icon: "\uD83C\uDFE0",
  },
];

export default function ReferralCTAs({ riskLevel }: ReferralCTAsProps) {
  const cards = REFERRAL_CARDS.filter((card) =>
    card.showOn.includes(riskLevel)
  );

  if (cards.length === 0) return null;

  return (
    <div className="mt-8 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Recommended next steps
        </h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {cards.map((card) => (
          <a
            key={card.id}
            href={card.ctaUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="group flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#0f1f3d] hover:shadow-sm transition-all"
          >
            <span className="text-2xl shrink-0 mt-0.5">{card.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-[#c9a84c] uppercase tracking-wide">
                  {card.category}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-[#0f1f3d]">
                {card.headline}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-2">
                {card.description}
              </p>
              <span className="text-xs font-semibold text-[#0f1f3d]">
                {card.ctaText}
              </span>
            </div>
          </a>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400 text-center">
        PermitCheck may earn a referral fee from these services. This does not
        affect our permit data or analysis.
      </p>
    </div>
  );
}
