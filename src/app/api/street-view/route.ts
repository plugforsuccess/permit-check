import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || address.length > 300) {
    return new NextResponse(null, { status: 400 });
  }

  // Rate limit by IP to protect Google Maps API quota
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await rateLimit(`streetview:${ip}`);
  if (!allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    return new NextResponse(null, { status: 500 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "800x300");
  url.searchParams.set("location", address);
  url.searchParams.set("fov", "90");
  url.searchParams.set("pitch", "5");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    return new NextResponse(null, { status: 404 });
  }

  const imageBuffer = await response.arrayBuffer();

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
