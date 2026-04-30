import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub fetch before importing the module under test.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { normalize, JurisdictionNotSupportedError } from "../lib/agent/steps/normalize";

describe("normalize", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("resolves an Atlanta address and returns the normalized shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "ChIJATL_PLACE_ID",
            formattedAddress: "55 Trinity Ave SW, Atlanta, GA 30303, USA",
            location: { latitude: 33.7488, longitude: -84.3925 },
          },
        ],
      }),
    });

    const result = await normalize({ address: "55 Trinity Ave SW, Atlanta" });

    expect(result.raw_address).toBe("55 Trinity Ave SW, Atlanta");
    expect(result.normalized_address).toBe(
      "55 Trinity Ave SW, Atlanta, GA 30303, USA",
    );
    expect(result.google_place_id).toBe("ChIJATL_PLACE_ID");
    expect(result.latitude).toBe(33.7488);
    expect(result.longitude).toBe(-84.3925);
    expect(result.jurisdiction).toBe("atlanta");
  });

  it("resolves a Gwinnett address to jurisdiction='gwinnett'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "ChIJGWN_PLACE_ID",
            formattedAddress: "1 Some St, Lawrenceville, GA 30043, USA",
            location: { latitude: 33.95, longitude: -83.99 },
          },
        ],
      }),
    });

    const result = await normalize({ address: "1 Some St, Lawrenceville" });
    expect(result.jurisdiction).toBe("gwinnett");
  });

  it("throws JurisdictionNotSupportedError for out-of-coverage addresses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "ChIJOUT_OF_AREA",
            formattedAddress: "100 Main St, Savannah, GA 31401, USA",
            location: { latitude: 32.08, longitude: -81.09 },
          },
        ],
      }),
    });

    await expect(
      normalize({ address: "100 Main St, Savannah" }),
    ).rejects.toThrow(JurisdictionNotSupportedError);
  });

  it("throws when Google Places returns no usable result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ places: [] }),
    });

    await expect(
      normalize({ address: "valid looking input" }),
    ).rejects.toThrow(/no usable result/);
  });

  it("throws when Google Places returns an HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "places API down",
    });

    await expect(
      normalize({ address: "valid looking input" }),
    ).rejects.toThrow(/Google Places Text Search failed: 500/);
  });

  it("sends correct headers + body to the Places API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "ChIJATL_PLACE_ID",
            formattedAddress: "55 Trinity Ave SW, Atlanta, GA 30303, USA",
            location: { latitude: 33.7, longitude: -84.4 },
          },
        ],
      }),
    });

    await normalize({ address: "55 Trinity Ave SW" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Goog-Api-Key"]).toBeTruthy();
    expect(init.headers["X-Goog-FieldMask"]).toContain("places.id");
    expect(init.headers["X-Goog-FieldMask"]).toContain("places.formattedAddress");
    expect(init.headers["X-Goog-FieldMask"]).toContain("places.location");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ textQuery: "55 Trinity Ave SW", regionCode: "US" });
  });

  it("rejects empty/short input via Zod", async () => {
    await expect(normalize({ address: "abc" })).rejects.toThrow();
  });
});
