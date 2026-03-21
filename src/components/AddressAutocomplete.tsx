"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

interface Prediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export default function AddressAutocomplete({
  onSelect,
  isLoading,
}: AddressAutocompleteProps) {
  const mapsReady = useMapsReady();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reportTypeRef = useRef<"standard" | "attorney">("standard");
  const onSelectRef = useRef(onSelect);

  const [reportType, setReportType] = useState<"standard" | "attorney">("standard");
  const [inputValue, setInputValue] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { reportTypeRef.current = reportType; }, [reportType]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Initialize AutocompleteService when Maps API is ready
  useEffect(() => {
    if (!mapsReady) return;

    const init = async () => {
      try {
        const placesLib = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
        serviceRef.current = new placesLib.AutocompleteService();
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
      } catch (err) {
        console.error("[AddressAutocomplete] init failed:", err);
      }
    };

    init();
  }, [mapsReady]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch predictions from AutocompleteService
  const fetchPredictions = useCallback((value: string) => {
    if (!serviceRef.current || value.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    serviceRef.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: "us" },
        types: ["address"],
        sessionToken: sessionTokenRef.current,
        locationBias: {
          center: { lat: 33.749, lng: -84.388 },
          radius: 50000,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (results: any[] | null, status: string) => {
        if (status === "OK" && results) {
          setPredictions(
            results.map((r) => ({
              placeId: r.place_id,
              mainText: r.structured_formatting?.main_text ?? r.description,
              secondaryText: r.structured_formatting?.secondary_text ?? "",
              description: r.description,
            }))
          );
          setShowDropdown(true);
          setActiveIndex(-1);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      }
    );
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(value), 250);
  };

  // Select a prediction — resolve place details via Geocoder
  const selectPrediction = async (prediction: Prediction) => {
    setInputValue(prediction.description);
    setShowDropdown(false);
    setPredictions([]);
    setError(null);
    setIsGeocoding(true);

    try {
      // @ts-expect-error
      const { Geocoder } = await google.maps.importLibrary("geocoding");
      const geocoder = new Geocoder();

      const result = await geocoder.geocode({ placeId: prediction.placeId });

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

      // Refresh session token after a selection
      const lib = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
      sessionTokenRef.current = new lib.AutocompleteSessionToken();

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

  // Geocode a raw text value (for Search button / Enter key)
  const geocodeAndSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isGeocoding || isLoading) return;

    setShowDropdown(false);
    setPredictions([]);
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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || predictions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        geocodeAndSubmit(inputValue);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < predictions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : predictions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < predictions.length) {
          selectPrediction(predictions[activeIndex]);
        } else {
          geocodeAndSubmit(inputValue);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        break;
    }
  };

  const busy = isLoading || isGeocoding;

  return (
    <div className="w-full max-w-2xl mx-auto">

      {/* Search input row */}
      <div className="flex items-stretch gap-3">

        {/* Input + dropdown container */}
        <div className="flex-1 min-w-0 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (predictions.length > 0) setShowDropdown(true);
            }}
            disabled={!mapsReady}
            placeholder={
              mapsReady
                ? "Enter a property address \u2014 e.g. 130 Trinity Ave SW"
                : "Loading\u2026"
            }
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls="address-listbox"
            aria-activedescendant={
              activeIndex >= 0 ? `address-option-${activeIndex}` : undefined
            }
            className="w-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg border-2 border-gray-200 rounded-xl outline-none focus:border-blue-400 transition-colors disabled:text-gray-400 disabled:placeholder-gray-400"
          />

          {/* Custom dropdown */}
          {showDropdown && predictions.length > 0 && (
            <div
              ref={dropdownRef}
              id="address-listbox"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-y-auto max-h-72"
            >
              {predictions.map((p, i) => (
                <button
                  key={p.placeId}
                  id={`address-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  type="button"
                  className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors ${
                    i === activeIndex
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  } ${i < predictions.length - 1 ? "border-b border-gray-100" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Prevent input blur before click fires
                    e.preventDefault();
                  }}
                  onClick={() => selectPrediction(p)}
                >
                  <span className="text-sm font-medium text-gray-900">
                    {p.mainText}
                  </span>
                  {p.secondaryText && (
                    <span className="text-xs text-gray-500">
                      {p.secondaryText}
                    </span>
                  )}
                </button>
              ))}
              <div className="px-4 py-2 flex justify-end border-t border-gray-100">
                <img
                  src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
                  alt="Powered by Google"
                  className="h-4"
                />
              </div>
            </div>
          )}
        </div>

        {/* Search button */}
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
