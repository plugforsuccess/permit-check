/**
 * Referral CTA configuration — contextual service provider cards
 * shown after payment based on risk level.
 */

export interface ReferralCard {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  icon: "inspector" | "attorney" | "lender" | "contractor";
  /** Which risk levels trigger this card */
  showFor: Array<"low" | "medium" | "high">;
}

const HOMEADVISOR_AFFILIATE_ID = process.env.HOMEADVISOR_AFFILIATE_ID ?? "";
const LENDINGTREE_AFFILIATE_ID = process.env.LENDINGTREE_AFFILIATE_ID ?? "";
const AVVO_AFFILIATE_ID = process.env.AVVO_AFFILIATE_ID ?? "";

export const referralCards: ReferralCard[] = [
  {
    id: "home-inspector",
    title: "Get a Professional Inspection",
    description:
      "A licensed home inspector can verify permit work was completed properly and identify unpermitted modifications.",
    cta: "Find an Inspector",
    href: HOMEADVISOR_AFFILIATE_ID
      ? `https://www.homeadvisor.com/tloc/Home-Inspection/?aid=${HOMEADVISOR_AFFILIATE_ID}`
      : "https://www.homeadvisor.com/tloc/Home-Inspection/",
    icon: "inspector",
    showFor: ["medium", "high"],
  },
  {
    id: "real-estate-attorney",
    title: "Consult a Real Estate Attorney",
    description:
      "An attorney can advise on permit compliance risks, negotiate seller concessions, and protect your interests at closing.",
    cta: "Find an Attorney",
    href: AVVO_AFFILIATE_ID
      ? `https://www.avvo.com/find-a-lawyer?aid=${AVVO_AFFILIATE_ID}`
      : "https://www.avvo.com/find-a-lawyer",
    icon: "attorney",
    showFor: ["high"],
  },
  {
    id: "contractor",
    title: "Get Repair Estimates",
    description:
      "A licensed contractor can estimate the cost to bring unpermitted work up to code or complete unfinished permit work.",
    cta: "Find a Contractor",
    href: HOMEADVISOR_AFFILIATE_ID
      ? `https://www.homeadvisor.com/?aid=${HOMEADVISOR_AFFILIATE_ID}`
      : "https://www.homeadvisor.com/",
    icon: "contractor",
    showFor: ["medium", "high"],
  },
  {
    id: "mortgage-lender",
    title: "Check Your Rate",
    description:
      "If this property checks out, lock in your best rate. Compare offers from multiple lenders in minutes.",
    cta: "Compare Rates",
    href: LENDINGTREE_AFFILIATE_ID
      ? `https://www.lendingtree.com/home/?esourceid=${LENDINGTREE_AFFILIATE_ID}`
      : "https://www.lendingtree.com/home/",
    icon: "lender",
    showFor: ["low"],
  },
];

export function getReferralCardsForRisk(
  riskLevel: "low" | "medium" | "high"
): ReferralCard[] {
  return referralCards.filter((card) => card.showFor.includes(riskLevel));
}
