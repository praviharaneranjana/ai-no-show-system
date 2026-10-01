"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Navigation, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASEMAP_STYLE, estimateTravelMinutes, formatTravel, HOSPITAL, TRAVEL_ASSUMPTION } from "@/lib/geo";
import type { FeatureContribution } from "@/lib/types";

interface JourneyMapProps {
  patientName?: string;
  city?: string | null;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  contributions?: FeatureContribution[];
  className?: string;
  mapHeightClass?: string;
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-lg border border-border bg-white text-foreground shadow-xs transition-colors hover:bg-muted dark:bg-[#1E1E2D]"
    >
      {children}
    </button>
  );
}

// The patient is plotted at their real geocoded location (town-level), the hospital at a
// fixed point in Colombo. Nothing here is derived from a random bearing.
export function JourneyMap({
  patientName = "Patient",
  city,
  distanceKm,
  latitude,
  longitude,
  contributions = [],
  className,
  mapHeightClass = "h-[220px]",
}: JourneyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const [useFallback, setUseFallback] = useState(false);
  const mapInstance = useRef<unknown>(null);

  const hasLocation = typeof latitude === "number" && typeof longitude === "number";
  const dist = typeof distanceKm === "number" ? distanceKm : 0;
  const estMins = estimateTravelMinutes(dist);

  const distContrib = contributions?.find(
    (c) => c.feature.toLowerCase() === "distance_km" || c.feature.toLowerCase() === "distance"
  );

  useEffect(() => {
    if (!hasLocation) return;
    const patientLat = latitude as number;
    const patientLng = longitude as number;
    let isCancelled = false;
    hasLoadedRef.current = false;

    async function initMap() {
      if (!mapContainer.current || typeof window === "undefined") return;
      try {
        const maplibre = await import("maplibre-gl");
        // Worker files are copied to /public/maplibre by scripts/copy-maplibre-worker.js.
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        if (isCancelled) return;

        const map = new maplibre.Map({
          container: mapContainer.current,
          style: BASEMAP_STYLE,
          center: [(HOSPITAL.lng + patientLng) / 2, (HOSPITAL.lat + patientLat) / 2],
          zoom: 10,
          interactive: true,
          attributionControl: false,
        });
        mapInstance.current = map;

        // Offline (e.g. air-gapped Electron): fall back to the schematic view.
        const timeoutId = setTimeout(() => {
          if (!hasLoadedRef.current) setUseFallback(true);
        }, 3500);

        map.on("load", () => {
          if (isCancelled) return;
          clearTimeout(timeoutId);
          hasLoadedRef.current = true;

          const hospitalEl = document.createElement("div");
          hospitalEl.className =
            "flex items-center justify-center size-7 rounded-full bg-[#171725] text-white shadow-md border-2 border-white ring-2 ring-[#171725]/20";
          hospitalEl.title = HOSPITAL.name;
          hospitalEl.innerHTML = `<span style="font-size: 11px;">🏥</span>`;
          new maplibre.Marker({ element: hospitalEl }).setLngLat([HOSPITAL.lng, HOSPITAL.lat]).addTo(map);

          const patientEl = document.createElement("div");
          patientEl.className =
            "flex items-center justify-center size-7 rounded-full bg-[#8B7CF6] text-white shadow-md border-2 border-white ring-2 ring-[#8B7CF6]/30";
          patientEl.title = `${patientName} (${city || "Home"})`;
          patientEl.innerHTML = `<span style="font-size: 10px;">🏠</span>`;
          new maplibre.Marker({ element: patientEl }).setLngLat([patientLng, patientLat]).addTo(map);

          // Straight line between the two real points (honest: not a road route).
          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [
                  [patientLng, patientLat],
                  [HOSPITAL.lng, HOSPITAL.lat],
                ],
              },
            },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#8B7CF6", "line-width": 3.5, "line-dasharray": [2, 1.5] },
          });

          const bounds = new maplibre.LngLatBounds();
          bounds.extend([HOSPITAL.lng, HOSPITAL.lat]);
          bounds.extend([patientLng, patientLat]);
          map.fitBounds(bounds, { padding: 45, maxZoom: 13, duration: 800 });
        });

        map.on("error", () => setUseFallback(true));
      } catch {
        setUseFallback(true);
      }
    }

    void initMap();

    return () => {
      isCancelled = true;
      if (mapInstance.current) {
        try {
          (mapInstance.current as { remove: () => void }).remove();
        } catch {}
      }
    };
  }, [hasLocation, latitude, longitude, city, patientName]);

  function handleZoomIn() {
    (mapInstance.current as { zoomIn?: () => void } | null)?.zoomIn?.();
  }
  function handleZoomOut() {
    (mapInstance.current as { zoomOut?: () => void } | null)?.zoomOut?.();
  }
  function handleFullscreen() {
    const el = mapContainer.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  if (!hasLocation) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-border bg-muted/30 px-4 text-center", mapHeightClass, className)}>
        <Compass className="size-5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Location unknown</p>
        <p className="text-[11px] text-muted-foreground">
          {city ? `“${city}” couldn’t be placed on the map.` : "No city recorded for this patient."}
        </p>
      </div>
    );
  }

  // Schematic fallback: real relative positions scaled into a small canvas.
  const dLng = (longitude as number) - HOSPITAL.lng;
  const dLat = (latitude as number) - HOSPITAL.lat;
  const span = Math.max(Math.abs(dLng), Math.abs(dLat), 0.001);
  const px = 170 + (dLng / span) * 110;
  const py = 90 - (dLat / span) * 55;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className={cn("relative w-full overflow-hidden rounded-[20px] border border-border bg-[#F4F4F7] dark:bg-[#1E1E2D]", mapHeightClass)}>
        {!useFallback ? <div ref={mapContainer} className="h-full w-full" /> : null}

        {useFallback && (
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <svg viewBox="0 0 340 180" className="h-full w-full">
              <line x1={px} y1={py} x2="170" y2="90" stroke="#8B7CF6" strokeWidth="3" strokeDasharray="6,4" strokeLinecap="round" />
              <circle cx={px} cy={py} r="10" fill="#8B7CF6" fillOpacity="0.2" />
              <circle cx={px} cy={py} r="5" fill="#8B7CF6" />
              <text x={px} y={py + 20} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">{city ?? "Patient"}</text>
              <circle cx="170" cy="90" r="10" fill="#171725" fillOpacity="0.15" />
              <circle cx="170" cy="90" r="5" fill="#171725" />
              <text x="170" y="74" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">{HOSPITAL.name}</text>
            </svg>
          </div>
        )}

        <div
          title={TRAVEL_ASSUMPTION}
          className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-xs dark:border-[#2D2D42] dark:bg-[#181824]/95"
        >
          <Navigation className="size-3.5 text-[#8B7CF6]" />
          <span className="font-rounded text-xs font-extrabold tabular-nums text-foreground">{dist.toFixed(1)} km</span>
          <span className="text-[10px] font-medium text-muted-foreground">· {formatTravel(estMins)} by road</span>
        </div>

        {!useFallback && (
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1">
            <MapButton label="Zoom in map" onClick={handleZoomIn}>
              <ZoomIn className="size-3.5" />
            </MapButton>
            <MapButton label="Zoom out map" onClick={handleZoomOut}>
              <ZoomOut className="size-3.5" />
            </MapButton>
            <MapButton label="Fullscreen map" onClick={handleFullscreen}>
              <Maximize2 className="size-3.5" />
            </MapButton>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Compass className="size-3.5 text-[#8B7CF6]" />
          <span>Lives in {city || "an unrecorded town"} (town-level location)</span>
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
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Low impact</span>
        )}
      </div>
    </div>
  );
}
