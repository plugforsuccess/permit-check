"use client";

import { useState, useEffect, useRef } from "react";
import { useMapsReady } from "@/components/GoogleMapsProvider";

export interface StructuredAddress {
  raw: string;
  streetNumber: string;
  streetName: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  onSelect: (address: StructuredAddress, reportType: "standard" | "attorney") => void;
  isLoading: boolean;
}

function parseFormattedAddress(
  formatted: string
): Omit<StructuredAddress, "raw" | "lat" | "lng"> {
  const cleaned = formatted
    .replace(/, USA$/, "")
    .replace(/, United States$/, "");
  const parts = cleaned.split(", ");
  const streetPart = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZip = parts[2] ?? "";
  const match = streetPart.match(/^(\d+)\s+(.+)$/);
  return {
    streetNumber: match?.[1] ?? "",
    streetName: match?.[2] ?? "",
    city,
    state: stateZip.split(" ")[0] ?? "",
    zip: stateZip.split(" ")[1] ?? "",
  };
}

export default function AddressAutocomplete({
  onSelect,
  isLoading,
}: AddressAutocompleteProps) {
  const mapsReady = useMapsReady();
  const gmpContainerRef = useRef<HTMLDivElement>(null);
  const gmpElementRef = useRef<HTMLElement | null>(null);

  // Store reportType and onSelect in refs — never include in useEffect deps
  // This prevents the Google element from remounting when reportType changes
  const reportTypeRef = useRef<"standard" | "attorney">("standard");
  const onSelectRef = useRef(onSelect);

  const [reportType, setReportType] = useState<"standard" | "attorney">("standard");
  const [inputValue, setInputValue] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync without triggering remounts
  useEffect(() => { reportTypeRef.current = reportType; }, [reportType]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Mount Google element ONCE when Maps API is ready
  // reportType is intentionally NOT in deps — we use the ref
  useEffect(() => {
    if (!mapsReady || !gmpContainerRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        // @ts-expect-error — PlaceAutocompleteElement not yet in TS types
        const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");

        if (cancelled) return;

        const el = new PlaceAutocompleteElement({
          componentRestrictions: { country: "us" },
          types: ["address"],
          locationBias: {
            center: { lat: 33.749, lng: -84.388 },
            radius: 50000,
          },
        });

        // Position absolute and invisible — our styled input is the visible one
        // The GMP element still handles autocomplete suggestion rendering
        el.style.cssText = `
          position: absolute;
          inset: 0;
          opacity: 0;
          z-index: 1;
          width: 100%;
          height: 100%;
        `;

        gmpContainerRef.current?.appendChild(el);
        gmpElementRef.current = el;

        // Handle dropdown selection — fires on tap/click of a suggestion
        el.addEventListener("gmp-select", async (event: Event) => {
          try {
            // @ts-expect-error
            const { placePrediction } = event;
            if (!placePrediction) return;

            const place = placePrediction.toPlace();
            await place.fetchFields({
              fields: ["addressComponents", "formattedAddress", "location"],
            });

            const formattedAddress = place.formattedAddress ?? "";
            if (!formattedAddress) return;

            const parsed = parseFormattedAddress(formattedAddress);
            setInputValue(formattedAddress);
            setError(null);

            onSelectRef.current(
              {
                raw: formattedAddress,
                ...parsed,
                lat: place.location?.lat() ?? 0,
                lng: place.location?.lng() ?? 0,
              },
              reportTypeRef.current
            );
          } catch (err) {
            console.error("[autocomplete] gmp-select handler failed:", err);
          }
        });
      } catch (err) {
        console.error("[AddressAutocomplete] init failed:", err);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (
        gmpElementRef.current &&
        gmpContainerRef.current?.contains(gmpElementRef.current)
      ) {
        gmpContainerRef.current.removeChild(gmpElementRef.current);
        gmpElementRef.current = null;
      }
    };
  }, [mapsReady]); // only mapsReady — intentional

  // Geocode whatever is in the input — handles paste + Search button tap
  const geocodeAndSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isGeocoding || isLoading) return;

    setError(null);
    setIsGeocoding(true);

    try {
      // @ts-expect-error
      const { Geocoder } = await google.maps.importLibrary("geocoding");
      const geocoder = new Geocoder();

      const result = await geocoder.geocode({
        address: trimmed,
        componentRestrictions: { country: "us" },
      });

      if (!result.results?.[0]) {
        setError("Address not found. Please try a more specific address.");
        setIsGeocoding(false);
        return;
      }

      const r = result.results[0];

      const get = (type: string) =>
        r.address_components.find(
          (c: { types: string[]; long_name: string }) => c.types.includes(type)
        )?.long_name ?? "";

      const getShort = (type: string) =>
        r.address_components.find(
          (c: { types: string[]; short_name: string }) => c.types.includes(type)
        )?.short_name ?? "";

      const formattedAddress = r.formatted_address;
      setInputValue(formattedAddress);

      onSelectRef.current(
        {
          raw: formattedAddress,
          streetNumber: get("street_number"),
          streetName: get("route"),
          city: get("locality") || get("sublocality"),
          state: getShort("administrative_area_level_1"),
          zip: get("postal_code"),
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
        },
        reportTypeRef.current
      );
    } catch (err) {
      console.error("[autocomplete] geocode failed:", err);
      setError("Could not find that address. Please try again.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      geocodeAndSubmit(inputValue);
    }
  };

  const busy = isLoading || isGeocoding;

  return (
    <div className="w-full max-w-2xl mx-auto">

      {/* Search input row */}
      <div className="flex items-stretch rounded-xl overflow-hidden border-2 border-gray-200 focus-within:border-blue-600 transition-colors h-[60px] bg-white">

        {/* Visible styled input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mapsReady
                ? "Enter a property address — e.g. 130 Trinity Ave SW"
                : "Loading..."
            }
            disabled={busy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-6 py-4 text-base sm:text-lg bg-transparent outline-none text-gray-900 placeholder-gray-400 disabled:text-gray-400"
          />

          {/* GMP element mounts here — invisible but handles suggestions */}
          <div
            ref={gmpContainerRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: mapsReady ? 1 : -1 }}
          />
        </div>

        {/* Search button — geocodes current input value */}
        <button
          type="button"
          onClick={() => geocodeAndSubmit(inputValue)}
          disabled={busy || !inputValue.trim()}
          className="px-5 sm:px-6 py-4 bg-[#0f1f3d] text-white font-semibold hover:bg-[#1a3560] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center justify-center"
          aria-label="Search"
        >
          {isGeocoding ? (
            <svg
              className="w-5 h-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {/* Report type selector */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 justify-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="reportType"
            value="standard"
            checked={reportType === "standard"}
            onChange={() => setReportType("standard")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            Standard Report{" "}
            <span className="font-semibold text-gray-900">$9.99</span>
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="reportType"
            value="attorney"
            checked={reportType === "attorney"}
            onChange={() => setReportType("attorney")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            Attorney Report{" "}
            <span className="font-semibold text-gray-900">$199</span>
          </span>
        </label>
      </div>

      <p className="mt-4 text-sm text-gray-400 text-center">
        Searching official permit databases across supported jurisdictions
      </p>
    </div>
  );
}
