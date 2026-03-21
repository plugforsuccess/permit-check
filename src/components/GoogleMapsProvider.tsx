"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { createContext, useContext, useState, useCallback } from "react";

const MapsReadyContext = createContext(false);
export const useMapsReady = () => useContext(MapsReadyContext);

export default function GoogleMapsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mapsReady, setMapsReady] = useState(false);
  const handleLoad = useCallback(() => setMapsReady(true), []);

  return (
    <APIProvider
      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
      libraries={["places", "geocoding"]}
      onLoad={handleLoad}
    >
      <MapsReadyContext.Provider value={mapsReady}>
        {children}
      </MapsReadyContext.Provider>
    </APIProvider>
  );
}
