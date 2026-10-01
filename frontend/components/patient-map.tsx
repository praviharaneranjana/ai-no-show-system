"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { BASEMAP_STYLE, HOSPITAL } from "@/lib/geo";
import type { GeoPoint } from "@/lib/types";

const RISK_COLOR = { High: "#E11D48", Medium: "#D97706", Low: "#16A34A" } as const;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Every patient is drawn at their real geocoded (town-level) location; the hospital is fixed.
export function PatientMap({ points }: { points: GeoPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    let ready = false;

    async function init() {
      if (!container.current) return;
      try {
        const maplibre = await import("maplibre-gl");
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        if (cancelled) return;

        const m = new maplibre.Map({
          container: container.current,
          style: BASEMAP_STYLE,
          center: [HOSPITAL.lng, HOSPITAL.lat],
          zoom: 8.2,
          attributionControl: { compact: true },
        });
        map = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        const timeout = setTimeout(() => {
          if (!ready) setUnavailable(true);
        }, 20000);

        m.on("load", () => {
          if (cancelled) return;
          ready = true;
          clearTimeout(timeout);
          setUnavailable(false);

          m.addSource("patients", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: points.map((p) => ({
                type: "Feature",
                properties: {
                  id: p.appointment_id,
                  name: p.patient_name,
                  city: p.city ?? "",
                  km: p.distance_km,
                  risk: p.risk_category ?? "Unscored",
                  pct: p.risk_score !== null ? Math.round(p.risk_score * 100) : -1,
                  day: p.appointment_day,
                },
                geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
              })),
            },
          });
          m.addLayer({
            id: "patients",
            type: "circle",
            source: "patients",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 7],
              "circle-color": ["match", ["get", "risk"], "High", RISK_COLOR.High, "Medium", RISK_COLOR.Medium, "Low", RISK_COLOR.Low, "#8C8CA1"],
              "circle-opacity": 0.75,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });

          const hospitalEl = document.createElement("div");
          hospitalEl.className = "flex size-8 items-center justify-center rounded-full border-2 border-white bg-[#171725] text-sm shadow-lg ring-2 ring-[#171725]/20";
          hospitalEl.title = HOSPITAL.name;
          hospitalEl.textContent = "🏥";
          new maplibre.Marker({ element: hospitalEl }).setLngLat([HOSPITAL.lng, HOSPITAL.lat]).addTo(m);

          m.on("click", "patients", (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties as { id: string; name: string; city: string; km: number; risk: string; pct: number; day: string };
            const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
            new maplibre.Popup({ offset: 10 })
              .setLngLat(coords)
              .setHTML(
                `<div style="font-family:inherit;font-size:12px;line-height:1.4;color:#171725">
                   <strong>${esc(p.name)}</strong><br/>
                   ${esc(p.city)} · ${Number(p.km).toFixed(1)} km<br/>
                   ${esc(p.risk)} risk${p.pct >= 0 ? ` (${p.pct}%)` : ""} · ${esc(p.day)}<br/>
                   <a href="/appointments/${encodeURIComponent(p.id)}" style="color:#8B7CF6;font-weight:700">Open record →</a>
                 </div>`
              )
              .addTo(m);
          });
          m.on("mouseenter", "patients", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "patients", () => (m.getCanvas().style.cursor = ""));

          if (points.length > 0) {
            const bounds = new maplibre.LngLatBounds([HOSPITAL.lng, HOSPITAL.lat], [HOSPITAL.lng, HOSPITAL.lat]);
            // focus on where most patients are: include points within 60 km, so a few far outliers don't zoom the map out to the whole island
            for (const p of points) if (p.distance_km <= 60) bounds.extend([p.longitude, p.latitude]);
            m.fitBounds(bounds, { padding: 50, maxZoom: 11, duration: 0 });
          }
        });

        m.on("error", () => {
          if (!ready) setUnavailable(true);
        });
      } catch {
        setUnavailable(true);
      }
    }

    void init();
    return () => {
      cancelled = true;
      try {
        map?.remove();
      } catch {}
    };
  }, [points]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[20px] border border-border bg-muted/30">
      <div ref={container} className="h-full w-full" />
      {unavailable && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/95 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Map tiles couldn’t be loaded</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The basemap needs internet access. Patient locations are still available in the table and on each appointment record.
          </p>
        </div>
      )}
    </div>
  );
}
