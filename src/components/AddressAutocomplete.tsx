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

/** Extract address components from Google Place object or fall back to string parsing. */
function extractAddressComponents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  place: any,
  formatted: string
): Omit<StructuredAddress, "raw" | "lat" | "lng"> {
  // Use Google's structured addressComponents when available
  const components = place?.addressComponents;
  if (components && Array.isArray(components)) {
    const get = (type: string) =>
      components.find((c: { types: string[] }) => c.types?.includes(type));
    return {
      streetNumber: get("street_number")?.longText ?? get("street_number")?.long_name ?? "",
      streetName: get("route")?.longText ?? get("route")?.long_name ?? "",
      city:
        get("locality")?.longText ?? get("locality")?.long_name ??
        get("sublocality")?.longText ?? get("sublocality")?.long_name ?? "",
      state:
        get("administrative_area_level_1")?.shortText ??
        get("administrative_area_level_1")?.short_name ?? "",
      zip: get("postal_code")?.longText ?? get("postal_code")?.long_name ?? "",
    };
  }

  // Fallback: parse formatted address string
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

        // The GMP element is the actual visible input — style it to fill the container
        el.style.width = "100%";
        el.setAttribute(
          "placeholder",
          "Enter a property address — e.g. 130 Trinity Ave SW"
        );

        gmpContainerRef.current?.appendChild(el);
        gmpElementRef.current = el;

        // Track what the user types so the Search button can geocode it.
        // PlaceAutocompleteElement uses a closed shadow root, so e.target is
        // retargeted to the host element (no .value). Instead, find the actual
        // <input> rendered inside the element and listen on it directly.
        const findAndObserveInput = () => {
          // Google may render the input as a light-DOM child or inside shadow DOM.
          // Try light DOM first, then open shadow root if available.
          const input =
            el.querySelector("input") ??
            el.shadowRoot?.querySelector("input") ??
            null;

          if (input) {
            input.addEventListener("input", () => {
              setInputValue(input.value);
            });
            input.addEventListener("keydown", (e: KeyboardEvent) => {
              // Allow Enter to geocode when no suggestion is actively selected.
              // The GMP element consumes Enter when a suggestion is highlighted,
              // so this only fires for "raw" Enter presses (paste + Enter).
              if (e.key === "Enter") {
                // Small delay: if gmp-select fires it will handle the submit,
                // otherwise we geocode the raw text.
                setTimeout(() => {
                  if (input.value.trim()) {
                    setInputValue(input.value);
                  }
                }, 0);
              }
            });
            return true;
          }
          return false;
        };

        // The internal <input> may not exist immediately — observe for it
        if (!findAndObserveInput()) {
          const observer = new MutationObserver(() => {
            if (findAndObserveInput()) observer.disconnect();
          });
          observer.observe(el, { childList: true, subtree: true });
          // Safety: stop observing after 5s to avoid leaks
          setTimeout(() => observer.disconnect(), 5000);
        }

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

            const parsed = extractAddressComponents(place, formattedAddress);
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

  const busy = isLoading || isGeocoding;

  return (
    <div className="w-full max-w-2xl mx-auto">

      {/* Search input row */}
      <div className="flex items-stretch gap-3">

        {/* GMP autocomplete element mounts here — it IS the visible input */}
        <div ref={gmpContainerRef} className="flex-1 min-w-0">
          {!mapsReady && (
            <input
              type="text"
              disabled
              placeholder="Loading..."
              className="w-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg border-2 border-gray-200 rounded-xl outline-none text-gray-400 placeholder-gray-400"
            />
          )}
        </div>

        {/* Search button — geocodes current input value */}
        <button
          type="button"
          onClick={() => geocodeAndSubmit(inputValue)}
          disabled={busy || !inputValue.trim()}
          className="px-5 sm:px-6 py-3 sm:py-4 bg-[#0f1f3d] text-white font-semibold rounded-xl hover:bg-[#1a3560] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center justify-center"
          aria-label="Search"
        >
          {isGeocoding ? (
            <svg
              className="w-5 h-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              role="status"
              aria-label="Searching address"
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
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-3 justify-center">
        <label className={`flex items-center gap-2.5 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors ${reportType === "standard" ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-gray-50"}`}>
          <input
            type="radio"
            name="reportType"
            value="standard"
            checked={reportType === "standard"}
            onChange={() => setReportType("standard")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Standard Report{" "}
            <span className="font-semibold text-gray-900">$9.99</span>
          </span>
        </label>
        <label className={`flex items-center gap-2.5 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors ${reportType === "attorney" ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-gray-50"}`}>
          <input
            type="radio"
            name="reportType"
            value="attorney"
            checked={reportType === "attorney"}
            onChange={() => setReportType("attorney")}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Attorney Report{" "}
            <span className="font-semibold text-gray-900">$199</span>
            <span className="text-xs text-gray-400 ml-1">(litigation-grade)</span>
          </span>
        </label>
      </div>

      <p className="mt-4 text-sm text-gray-400 text-center">
        Searching official permit databases across supported jurisdictions
      </p>
    </div>
  );
}
