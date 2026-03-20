interface PropertyStreetViewProps {
  address: string;
  lat?: number;
  lng?: number;
}

export default function PropertyStreetView({
  address,
}: PropertyStreetViewProps) {
  const src = `/api/street-view?address=${encodeURIComponent(address)}`;

  return (
    <div className="w-full h-48 rounded-xl overflow-hidden bg-gray-100 relative street-view-wrapper">
      <img
        src={src}
        alt={`Street view of ${address}`}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLElement).closest(".street-view-wrapper")?.remove();
        }}
      />
      <div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
        Google Street View
      </div>
    </div>
  );
}
