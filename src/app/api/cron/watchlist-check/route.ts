import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrapeAccelaPermits } from "@/lib/accela/index";
import { sendWatchlistAlert } from "@/lib/watchlist-email";
import { log } from "@/lib/logger";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Require CRON_SECRET — reject all requests if unset to prevent public access
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const now = new Date();

  // Fetch active, non-expired watches not checked in 24h
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: watches } = await supabase
    .from("watchlist")
    .select("*")
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .or(
      `last_checked_at.is.null,last_checked_at.lt.${cutoff.toISOString()}`
    )
    .limit(50); // Process max 50 watches per cron run

  if (!watches || watches.length === 0) {
    return NextResponse.json({ checked: 0, alerts: 0 });
  }

  log.info("Watchlist cron: checking addresses", { count: watches.length });

  let alertsSent = 0;

  for (const watch of watches) {
    try {
      const parts = watch.address_normalized.split(/\s+/);
      const streetNumber = parts[0];
      const streetName = parts.slice(1).join(" ");

      const result = await scrapeAccelaPermits(
        streetNumber,
        streetName,
        watch.jurisdiction_id
      );

      const currentCount = result.permits.length;
      const previousCount = watch.last_permit_count ?? 0;

      // Update last checked timestamp
      await supabase
        .from("watchlist")
        .update({
          last_checked_at: now.toISOString(),
          last_permit_count: currentCount,
        })
        .eq("id", watch.id);

      // Send alert if new permits found
      if (currentCount > previousCount) {
        const newPermits = result.permits.slice(0, currentCount - previousCount);

        await sendWatchlistAlert({
          to: watch.email,
          address: watch.address_normalized,
          newPermitCount: currentCount - previousCount,
          newPermits,
          reportUrl: watch.lookup_id
            ? `${process.env.NEXT_PUBLIC_APP_URL}/results/${watch.lookup_id}`
            : `${process.env.NEXT_PUBLIC_APP_URL}`,
        });

        alertsSent++;
        log.info("Watchlist: alert sent", {
          address: watch.address_normalized,
          newCount: currentCount - previousCount,
        });
      }

      // Deactivate expired watches
      if (watch.expires_at && new Date(watch.expires_at) < now) {
        await supabase
          .from("watchlist")
          .update({ active: false })
          .eq("id", watch.id);
      }

      // Pause between scrapes
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      log.error("Watchlist: check failed", {
        address: watch.address_normalized,
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    checked: watches.length,
    alerts: alertsSent,
  });
}
