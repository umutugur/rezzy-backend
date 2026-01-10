import React from "react";
import { MapContainer, TileLayer, FeatureGroup, useMap, CircleMarker, Popup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import type { LeafletEvent } from "leaflet";

type LngLat = [number, number]; // [lng, lat]

export type DeliveryPolygon = {
  type: "Polygon";
  coordinates: LngLat[][];
};

type Props = {
  center?: { lat: number; lng: number };
  value?: DeliveryPolygon | null;
  polygon?: DeliveryPolygon | null; // back-compat
  onChange: (poly: DeliveryPolygon | null) => void;
  height?: number;
};

function RecenterMap({ center, zoom }: { center: { lat: number; lng: number }; zoom?: number }) {
  const map = useMap();

  React.useEffect(() => {
    if (!center?.lat || !center?.lng) return;
    // Keep current zoom unless a specific zoom is provided
    const z = typeof zoom === "number" ? zoom : map.getZoom();
    map.setView([center.lat, center.lng], z, { animate: false });
  }, [map, center.lat, center.lng, zoom]);

  // When this component is rendered inside a tab/accordion, Leaflet can mount with zero size.
  // This forces it to recompute layout.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 0);
    return () => window.clearTimeout(t);
  }, [map]);

  return null;
}

function FitPolygonBounds({ polygon }: { polygon: DeliveryPolygon | null }) {
  const map = useMap();

  React.useEffect(() => {
    if (!polygon) return;

    try {
      const layer = L.polygon(geoToLeaflet(polygon));
      const b = layer.getBounds();
      if (b && b.isValid()) {
        map.fitBounds(b, { padding: [16, 16] });
      }
    } catch {
      // ignore
    }
  }, [map, polygon]);

  return null;
}

function geoToLeaflet(poly: DeliveryPolygon): L.LatLngExpression[] {
  const ring = poly.coordinates[0] || [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

function leafletToGeo(layer: L.Polygon): DeliveryPolygon {
  const latlngs = layer.getLatLngs()[0] as L.LatLng[];
  const coords: LngLat[] = latlngs.map((p) => [p.lng, p.lat]);

  // GeoJSON: ring kapalı olmalı
  if (coords.length > 2) {
    const last = coords[coords.length - 1];
    if (!last || coords[0][0] !== last[0] || coords[0][1] !== last[1]) {
      coords.push(coords[0]);
    }
  }

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

export default function DeliveryZoneMap({
  center = { lat: 35.1856, lng: 33.3823 }, // Lefkoşa
  value,
  polygon,
  onChange,
  height = 360,
}: Props) {
  const fgRef = React.useRef<L.FeatureGroup>(null);
  const effective = value ?? polygon ?? null;

  // dışarıdan polygon gelirse çiz
  React.useEffect(() => {
    if (!fgRef.current) return;

    fgRef.current.clearLayers();

    if (effective) {
      const layer = L.polygon(geoToLeaflet(effective));
      fgRef.current.addLayer(layer);
    }
  }, [effective]);

  return (
    <div style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: "100%", width: "100%", borderRadius: 12 }}
      >
        <RecenterMap center={center} />
        <FitPolygonBounds polygon={effective} />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Restaurant location pin (always visible) */}
        {Number.isFinite(center?.lat) && Number.isFinite(center?.lng) ? (
          <CircleMarker
            center={[center.lat, center.lng]}
            radius={10}
            pathOptions={{ weight: 2 }}
          >
            <Popup>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Restoran Konumu</div>
                <div>
                  Lat: {center.lat.toFixed(6)} / Lng: {center.lng.toFixed(6)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ) : null}

        <FeatureGroup ref={fgRef}>
          <EditControl
            position="topright"
            draw={{
              rectangle: false,
              circle: false,
              circlemarker: false,
              marker: false,
              polyline: false,
              polygon: {
                allowIntersection: false,
                showArea: true,
              },
            }}
            onCreated={(e: LeafletEvent & { layer: any }) => {
              const layer = e.layer as L.Polygon;
              fgRef.current?.clearLayers();
              fgRef.current?.addLayer(layer);
              onChange(leafletToGeo(layer));
            }}
            onEdited={(e: LeafletEvent & { layers: any }) => {
              const layers = e.layers.getLayers();
              if (layers.length) {
                onChange(leafletToGeo(layers[0] as L.Polygon));
              }
            }}
            onDeleted={() => onChange(null)}
          />
        </FeatureGroup>
      </MapContainer>
    </div>
  );
}