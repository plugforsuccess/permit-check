"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { createContext, useContext, useState, useCallback } from "react";
import { env } from "@/lib/env";

const MapsReadyContext = createContext(false);
export const useMapsReady = () => useContext(MapsReadyContext);

const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function GoogleMapsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mapsReady, setMapsReady] = useState(false);
  const handleLoad = useCallback(() => setMapsReady(true), []);

  if (!apiKey) {
    return (
      <MapsReadyContext.Provider value={false}>
        {children}
      </MapsReadyContext.Provider>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={["places", "geocoding"]}
      onLoad={handleLoad}
    >
      <MapsReadyContext.Provider value={mapsReady}>
        {children}
      </MapsReadyContext.Provider>
    </APIProvider>
  );
}
