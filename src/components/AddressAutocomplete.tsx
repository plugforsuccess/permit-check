"use client";

import { useState, useCallback } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

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
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [reportType, setReportType] = useState<"standard" | "attorney">("standard");
  const [inputValue, setInputValue] = useState("");
  const [selected, setSelected] = useState(false);

  const onSelectStable = useCallback(onSelect, [onSelect]);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    autocompleteRef.current = new placesLib.Autocomplete(inputRef.current, {
      bounds: {
        north: 34.2,
        south: 33.4,
        east: -83.8,
        west: -84.9,
      },
      strictBounds: false,
      componentRestrictions: { country: "us" },
      fields: ["address_components", "formatted_address", "geometry"],
      types: ["address"],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current!.getPlace();
      if (!place.address_components || !place.geometry) return;

      const get = (type: string) =>
        place.address_components!.find((c) => c.types.includes(type))
          ?.long_name ?? "";

      const getShort = (type: string) =>
        place.address_components!.find((c) => c.types.includes(type))
          ?.short_name ?? "";

      const streetNumber = get("street_number");
      const route = get("route");
      const city = get("locality") || get("sublocality");
      const state = getShort("administrative_area_level_1");
      const zip = get("postal_code");
      const lat = place.geometry!.location!.lat();
      const lng = place.geometry!.location!.lng();

      const structured: StructuredAddress = {
        raw: place.formatted_address ?? "",
        streetNumber,
        streetName: route,
        city,
        state,
        zip,
        lat,
        lng,
      };

      setInputValue(place.formatted_address ?? "");
      setSelected(true);
      onSelectStable(structured, reportType);
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [placesLib, reportType, onSelectStable]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setSelected(false);
          }}
          placeholder="Enter a property address — e.g. 130 Trinity Ave SW"
          className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900 placeholder-gray-400"
          disabled={isLoading}
          aria-label="Property address"
          autoComplete="off"
        />
        {selected && (
          <button
            type="button"
            onClick={() => {
              setInputValue("");
              setSelected(false);
              inputRef.current?.focus();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear address"
          >
            ✕
          </button>
        )}
      </div>

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
