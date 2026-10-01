// Fixed hospital location (mirrors backend/app/geo.py). Patients are plotted at their
// real geocoded coordinates; distance is straight-line, travel time is an estimate.
export const HOSPITAL = {
  name: "Colombo General Hospital",
  lat: 6.919,
  lng: 79.8668,
};

const ROAD_FACTOR = 1.3; // road distance is typically ~1.3x straight-line
const AVG_KMH = 30; // average urban / inter-city speed

export function estimateTravelMinutes(straightKm: number): number {
  return Math.max(1, Math.round(((straightKm * ROAD_FACTOR) / AVG_KMH) * 60));
}

export function formatTravel(minutes: number): string {
  if (minutes < 90) return `~${minutes} min`;
  return `~${(minutes / 60).toFixed(1)} h`;
}

export const TRAVEL_ASSUMPTION = `Straight-line distance. Travel time assumes roads ≈ ${ROAD_FACTOR}× straight-line at ${AVG_KMH} km/h.`;

export const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
