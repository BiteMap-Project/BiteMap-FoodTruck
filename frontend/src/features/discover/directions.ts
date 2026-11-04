export function directionsUrl(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${latitude},${longitude}` })}`;
}
