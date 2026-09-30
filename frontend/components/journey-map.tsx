"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Navigation, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureContribution } from "@/lib/types";

// Default Colombo National Hospital coordinates
const DEFAULT_HOSPITAL_LAT = parseFloat(process.env.NEXT_PUBLIC_HOSPITAL_LAT || "6.9271");
const DEFAULT_HOSPITAL_LNG = parseFloat(process.env.NEXT_PUBLIC_HOSPITAL_LNG || "79.8612");
const DEFAULT_HOSPITAL_NAME = process.env.NEXT_PUBLIC_HOSPITAL_NAME || "National Hospital of Sri Lanka";

interface JourneyMapProps {
  patientId?: string;
  patientName?: string;
  city?: string | null;
  distanceKm?: number | null;
  contributions?: FeatureContribution[];
  className?: string;
}

/**
 * Deterministically derives a bearing (0-360 degrees) seeded by the patientId string.
 */
function getDeterministicBearing(seedStr: string): number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  // Spread across all 360 degrees
  return (absHash % 360) * (Math.PI / 180);
}

/**
 * Calculates coordinates `distanceKm` away from hospital along bearing.
 * 1 deg latitude ≈ 111 km.
 */
function calculateDestination(lat: number, lng: number, distanceKm: number, bearingRad: number): [number, number] {
  const dLat = (distanceKm / 111.0) * Math.cos(bearingRad);
  const dLng = (distanceKm / (111.0 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearingRad);
  return [lat + dLat, lng + dLng];
}

export function JourneyMap({
  patientId = "sample-patient",
  patientName = "Patient",
  city = "Colombo Outskirts",
  distanceKm,
  contributions = [],
  className,
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const [useFallback, setUseFallback] = useState(false);
  const mapInstance = useRef<unknown>(null);

  const hasDistance = typeof distanceKm === "number" && distanceKm > 0;
  const dist = hasDistance ? distanceKm : 0;
  // Estimated travel time assuming ~25 km/h urban speed in Sri Lanka
  const estMins = Math.round((dist / 25) * 60);

  // Find distance contribution from SHAP explanations
  const distContrib = contributions?.find(
    (c) => c.feature.toLowerCase() === "distance_km" || c.feature.toLowerCase() === "distance"
  );

  const bearing = getDeterministicBearing(patientId);
  const [patientLat, patientLng] = calculateDestination(
    DEFAULT_HOSPITAL_LAT,
    DEFAULT_HOSPITAL_LNG,
    dist,
    bearing
  );

  useEffect(() => {
    let isCancelled = false;
    hasLoadedRef.current = false;

    async function initMap() {
      if (!hasDistance || !mapContainer.current || typeof window === "undefined") return;

      try {
        const maplibre = await import("maplibre-gl");
        if (isCancelled) return;

        // Clean Carto Positron basemap (Dropify pale minimal roads look)
        const map = new maplibre.Map({
          container: mapContainer.current,
          style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          center: [(DEFAULT_HOSPITAL_LNG + patientLng) / 2, (DEFAULT_HOSPITAL_LAT + patientLat) / 2],
          zoom: 10,
          interactive: true,
          attributionControl: false,
        });

        mapInstance.current = map;

        // Timeout fallback if tile loading takes too long (e.g. offline Electron)
        const timeoutId = setTimeout(() => {
          if (!hasLoadedRef.current) {
            setUseFallback(true);
          }
        }, 3500);

        map.on("load", () => {
          if (isCancelled) return;
          clearTimeout(timeoutId);
          hasLoadedRef.current = true;

          // Add Hospital Dark Pin Marker
          const hospitalEl = document.createElement("div");
          hospitalEl.className = "flex items-center justify-center size-7 rounded-full bg-[#171725] text-white shadow-md border-2 border-white ring-2 ring-[#171725]/20";
          hospitalEl.title = DEFAULT_HOSPITAL_NAME;
          hospitalEl.innerHTML = `<span style="font-size: 11px;">🏥</span>`;
          new maplibre.Marker({ element: hospitalEl })
            .setLngLat([DEFAULT_HOSPITAL_LNG, DEFAULT_HOSPITAL_LAT])
            .addTo(map);

          // Add Patient Primary Violet Marker
          const patientEl = document.createElement("div");
          patientEl.className = "flex items-center justify-center size-7 rounded-full bg-[#8B7CF6] text-white shadow-md border-2 border-white ring-2 ring-[#8B7CF6]/30";
          patientEl.title = `${patientName} (${city || "Home"})`;
          patientEl.innerHTML = `<span style="font-size: 10px;">🏠</span>`;
          new maplibre.Marker({ element: patientEl })
            .setLngLat([patientLng, patientLat])
            .addTo(map);

          // Add Purple Route Line
          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [
                  [patientLng, patientLat],
                  [(patientLng + DEFAULT_HOSPITAL_LNG) / 2 + 0.008, (patientLat + DEFAULT_HOSPITAL_LAT) / 2 - 0.005],
                  [DEFAULT_HOSPITAL_LNG, DEFAULT_HOSPITAL_LAT],
                ],
              },
            },
          });

          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#8B7CF6",
              "line-width": 3.5,
              "line-dasharray": [2, 1.5],
            },
          });

          // Fit bounds
          const bounds = new maplibre.LngLatBounds();
          bounds.extend([DEFAULT_HOSPITAL_LNG, DEFAULT_HOSPITAL_LAT]);
          bounds.extend([patientLng, patientLat]);
          map.fitBounds(bounds, { padding: 45, maxZoom: 13, duration: 800 });
        });

        map.on("error", () => {
          setUseFallback(true);
        });
      } catch {
        setUseFallback(true);
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstance.current) {
        try {
          (mapInstance.current as { remove: () => void }).remove();
        } catch {}
      }
    };
  }, [patientId, dist, hasDistance, patientLat, patientLng, city, patientName]);

  function handleZoomIn() {
    if (mapInstance.current) {
      (mapInstance.current as { zoomIn: () => void }).zoomIn();
    }
  }

  function handleZoomOut() {
    if (mapInstance.current) {
      (mapInstance.current as { zoomOut: () => void }).zoomOut();
    }
  }

  function handleFullscreen() {
    const el = mapContainer.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  if (!hasDistance) {
    return (
      <div className={cn("flex h-[220px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-border bg-muted/30 px-4 text-center", className)}>
        <Compass className="size-5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Distance not recorded</p>
        <p className="text-[11px] text-muted-foreground">Add the patient&apos;s distance from the hospital to see the journey map.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Map Window */}
      <div className="relative h-[220px] w-full overflow-hidden rounded-[20px] border border-border bg-[#F4F4F7] dark:bg-[#1E1E2D]">
        {/* Real WebGL Map Container */}
        {!useFallback ? (
          <div ref={mapContainer} className="h-full w-full" />
        ) : null}

        {/* Offline / Electron SVG Fallback (Always reliable) */}
        {useFallback && (
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <svg viewBox="0 0 340 180" className="h-full w-full">
              {/* Road Grid Lines */}
              <path d="M 20 40 L 320 80 M 10 140 L 330 110 M 100 0 L 80 180 M 240 0 L 220 180" stroke="#E2E2EA" strokeWidth="2" />
              {/* Purple Route */}
              <path d="M 60 130 Q 140 70, 260 45" fill="none" stroke="#8B7CF6" strokeWidth="3" strokeDasharray="6,4" strokeLinecap="round" />
              {/* Patient Pin */}
              <g transform="translate(60, 130)">
                <circle cx="0" cy="0" r="10" fill="#8B7CF6" fillOpacity="0.2" />
                <circle cx="0" cy="0" r="5" fill="#8B7CF6" />
                <text x="-25" y="18" fontSize="9" fontWeight="700" fill="currentColor" className="text-foreground">Patient</text>
              </g>
              {/* Hospital Pin */}
              <g transform="translate(260, 45)">
                <circle cx="0" cy="0" r="10" fill="#171725" fillOpacity="0.15" />
                <circle cx="0" cy="0" r="5" fill="#171725" />
                <text x="-25" y="-10" fontSize="9" fontWeight="700" fill="currentColor" className="text-foreground">{DEFAULT_HOSPITAL_NAME}</text>
              </g>
            </svg>
          </div>
        )}

        {/* Bottom-Left Overlay: "{distance_km} km / ~{travel_time} min" (Dropify "44,7 / 93,9 mi") */}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-xs dark:border-[#2D2D42] dark:bg-[#181824]/95">
          <Navigation className="size-3.5 text-[#8B7CF6]" />
          <span className="font-rounded font-extrabold text-xs text-foreground tabular-nums">
            {dist.toFixed(1)} km
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            · ~{estMins}m transit
          </span>
        </div>

        {/* Bottom-Right Controls: Zoom +/- and Fullscreen */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in map"
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-white shadow-xs text-foreground transition-colors hover:bg-muted dark:bg-[#1E1E2D]"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out map"
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-white shadow-xs text-foreground transition-colors hover:bg-muted dark:bg-[#1E1E2D]"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Fullscreen map"
            onClick={handleFullscreen}
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-white shadow-xs text-foreground transition-colors hover:bg-muted dark:bg-[#1E1E2D]"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Distance Impact Chip Row (§4.4 & §5.4) */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
          <Compass className="size-3.5 text-[#8B7CF6]" />
          <span>Approximate location: {city || "Western Province"}</span>
        </div>

        {distContrib ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold",
              distContrib.contribution > 0
                ? "bg-[#FFE4E6] text-[#E11D48] dark:bg-rose-950/40 dark:text-rose-300"
                : "bg-[#DCFCE7] text-[#16A34A] dark:bg-emerald-950/40 dark:text-emerald-300"
            )}
          >
            {distContrib.contribution > 0 ? "Raises" : "Lowers"} risk · ×{Math.exp(distContrib.contribution).toFixed(2)} odds
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Low impact
          </span>
        )}
      </div>
    </div>
  );
}
