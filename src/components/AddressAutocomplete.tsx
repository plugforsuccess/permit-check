"use client";

import { useState, useEffect, useRef } from "react";

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

export default function AddressAutocomplete({
  onSelect,
  isLoading,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const [reportType, setReportType] = useState<"standard" | "attorney">("standard");
  const [mapsReady, setMapsReady] = useState(false);

  // Poll for the google global to be available
  useEffect(() => {
    const check = () => {
      if (typeof google !== "undefined" && google.maps) {
        setMapsReady(true);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }, []);

  useEffect(() => {
    if (!mapsReady || !containerRef.current || isLoading) return;

    // Clean up any existing element
    if (elementRef.current && containerRef.current.contains(elementRef.current)) {
      containerRef.current.removeChild(elementRef.current);
      elementRef.current = null;
    }

    const initAutocomplete = async () => {
      try {
        // @ts-expect-error — PlaceAutocompleteElement not yet in TS types
        const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");

        const placeAutocomplete = new PlaceAutocompleteElement({
          componentRestrictions: { country: "us" },
          types: ["address"],
          locationBias: {
            center: { lat: 33.749, lng: -84.388 },
            radius: 50000,
          },
        });

        // Match the existing input styling
        placeAutocomplete.style.width = "100%";
        placeAutocomplete.setAttribute(
          "placeholder",
          "Enter a property address — e.g. 130 Trinity Ave SW"
        );

        containerRef.current?.appendChild(placeAutocomplete);
        elementRef.current = placeAutocomplete;

        placeAutocomplete.addEventListener("gmp-placeselect", async (event: Event) => {
            console.log("[autocomplete] gmp-placeselect fired", event);
          // @ts-expect-error
          const { place } = event;
          await place.fetchFields({
            fields: ["addressComponents", "formattedAddress", "location"],
          });

          const get = (type: string) =>
            place.addressComponents?.find(
              (c: { types: string[]; longText: string }) => c.types.includes(type)
            )?.longText ?? "";

          const getShort = (type: string) =>
            place.addressComponents?.find(
              (c: { types: string[]; shortText: string }) => c.types.includes(type)
            )?.shortText ?? "";

          onSelect(
            {
              raw: place.formattedAddress ?? "",
              streetNumber: get("street_number"),
              streetName: get("route"),
              city: get("locality") || get("sublocality"),
              state: getShort("administrative_area_level_1"),
              zip: get("postal_code"),
              lat: place.location?.lat() ?? 0,
              lng: place.location?.lng() ?? 0,
            },
            reportType
          );
        });
      } catch (err) {
        console.error("[AddressAutocomplete] Failed to initialize:", err);
      }
    };

    initAutocomplete();

    return () => {
      if (elementRef.current && containerRef.current?.contains(elementRef.current)) {
        containerRef.current.removeChild(elementRef.current);
        elementRef.current = null;
      }
    };
  }, [mapsReady, reportType, onSelect, isLoading]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Fallback shown while Maps API loads */}
      {!mapsReady && (
        <input
          type="text"
          disabled
          placeholder="Loading address search..."
          className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl outline-none text-gray-400"
        />
      )}
      <div ref={containerRef} className="w-full" />

      <div className="mt-4 flex items-center gap-6 justify-center">
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
        Searching official permit databases across the Atlanta metro
      </p>
    </div>
  );
}
