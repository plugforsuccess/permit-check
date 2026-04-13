export function hasAgentAccess(
  subscriptionStatus: string | null | undefined
): boolean {
  return (
    subscriptionStatus === "active" || subscriptionStatus === "trialing"
  );
}

export function getSubscriptionMessage(
  subscriptionStatus: string | null | undefined
): string {
  switch (subscriptionStatus) {
    case "canceled":
      return "Your Investor Plan subscription has been canceled.";
    case "past_due":
      return "Your subscription payment failed — update your billing to restore access.";
    case "unpaid":
      return "Your subscription payment is overdue — update your billing to restore access.";
    default:
      return "Get unlimited searches with the Investor Plan.";
  }
}

export function getSubscriptionCTA(
  subscriptionStatus: string | null | undefined
): string {
  return subscriptionStatus === "canceled" ||
    subscriptionStatus === "past_due" ||
    subscriptionStatus === "unpaid"
    ? "Resubscribe →"
    : "Get unlimited access →";
}
