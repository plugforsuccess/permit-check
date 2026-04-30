import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch + supabase before importing the module under test.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockUpsertSelectSingle = vi.fn();

vi.mock("../lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: () => ({
        select: () => ({
          single: mockUpsertSelectSingle,
        }),
      }),
    }),
  }),
}));

import { parcel } from "../lib/agent/steps/parcel";
import type { NormalizeOutput } from "../lib/agent/steps/normalize";

const stubNormalized: NormalizeOutput = {
  raw_address: "55 Trinity Ave SW",
  normalized_address: "55 Trinity Ave SW, Atlanta, GA 30303, USA",
  google_place_id: "ChIJATL",
  latitude: 33.7488,
  longitude: -84.3925,
  jurisdiction: "atlanta",
};

describe("parcel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpsertSelectSingle.mockReset();
    mockUpsertSelectSingle.mockResolvedValue({
      data: { id: "00000000-0000-0000-0000-000000000001" },
      error: null,
    });
  });

  it("returns characteristics from REAPI and upserts properties row", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          propertyInfo: {
            apn: "14-0079-0001-001-9",
            yearBuilt: 1923,
            livingSquareFeet: 2400,
            propertyUseCode: "Single Family Residence",
          },
        },
      }),
    });

    const result = await parcel({ normalized: stubNormalized });

    expect(result).toEqual({
      parcel_id: "14-0079-0001-001-9",
      year_built: 1923,
      square_feet: 2400,
      property_type: "Single Family Residence",
    });
    expect(mockUpsertSelectSingle).toHaveBeenCalledTimes(1);
  });

  it("falls back to parcelNumber when apn is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          propertyInfo: {
            parcelNumber: "PARCEL-XYZ",
            yearBuilt: 2010,
          },
        },
      }),
    });

    const result = await parcel({ normalized: stubNormalized });
    expect(result.parcel_id).toBe("PARCEL-XYZ");
    expect(result.year_built).toBe(2010);
  });

  it("returns all-null fields when REAPI response has no propertyInfo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const result = await parcel({ normalized: stubNormalized });
    expect(result).toEqual({
      parcel_id: null,
      year_built: null,
      square_feet: null,
      property_type: null,
    });
  });

  it("throws on REAPI HTTP error so orchestrator failure handler catches", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });

    await expect(parcel({ normalized: stubNormalized })).rejects.toThrow(
      /REAPI PropertyDetail failed: 502/,
    );
  });

  it("throws when properties UPSERT fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { propertyInfo: { apn: "X", yearBuilt: 2000 } },
      }),
    });
    mockUpsertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(parcel({ normalized: stubNormalized })).rejects.toThrow(
      /properties UPSERT failed/,
    );
  });

  it("falls back to squareFeet when livingSquareFeet is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { propertyInfo: { apn: "X", squareFeet: 1500 } },
      }),
    });

    const result = await parcel({ normalized: stubNormalized });
    expect(result.square_feet).toBe(1500);
  });
});
