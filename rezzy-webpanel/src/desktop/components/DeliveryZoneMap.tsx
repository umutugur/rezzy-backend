import React from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Pane } from "react-leaflet";

export type HexAxial = { q: number; r: number };

export type DeliveryHexZone = {
  id: string; // stable key (ex: "hex-1")
  name?: string; // optional label (ex: "Bölge 1")
  isActive: boolean;
  minOrderAmount: number;
  feeAmount: number;
};

type Props = {
  center?: { lat: number; lng: number };

  // Zones are owned by SettingsPage (source of truth)
  zones: DeliveryHexZone[];
  selectedZoneId?: string | null;

  // Grid controls (SettingsPage sends the whole object)
  gridSettings?: {
    cellSizeMeters: number;
    radiusMeters: number;
    orientation?: "flat" | "pointy";
  };

  // UI callbacks
  onSelectZone: (zoneId: string) => void;
  onToggleZone: (zoneId: string, isActive: boolean) => void;

  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ringCountFromRadius(radiusMeters: number, cellSizeMeters: number) {
  const r = Number(radiusMeters);
  const s = Number(cellSizeMeters);
  if (!Number.isFinite(r) || !Number.isFinite(s) || r <= 0 || s <= 0) return 2;
  // Approx: ring center distance grows ~1.6 * size per ring in our projection.
  return clamp(Math.round(r / (s * 1.6)), 1, 6);
}

// --- Hex math ---
// We support both orientations for corner generation.
// Axial -> meters uses pointy-top axial layout; good enough for delivery zoning.

function metersToLatDegrees(m: number) {
  return m / 111_320;
}

function metersToLngDegrees(m: number, atLat: number) {
  const latRad = (atLat * Math.PI) / 180;
  const denom = 111_320 * Math.cos(latRad);
  return denom === 0 ? 0 : m / denom;
}

function axialToMeters(ax: HexAxial, size: number) {
  const x = size * Math.sqrt(3) * (ax.q + ax.r / 2);
  const y = size * (3 / 2) * ax.r;
  return { x, y };
}

function hexCornerOffsetsMeters(size: number, orientation: "flat" | "pointy") {
  // pointy-top corners: angle 30 + i*60
  // flat-top corners: angle 0 + i*60
  const start = orientation === "flat" ? 0 : 30;
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((start + 60 * i) * Math.PI) / 180;
    corners.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return corners;
}

function axialHexToLatLngPolygon(
  center: { lat: number; lng: number },
  ax: HexAxial,
  sizeMeters: number,
  orientation: "flat" | "pointy"
) {
  const { x, y } = axialToMeters(ax, sizeMeters);
  const corners = hexCornerOffsetsMeters(sizeMeters, orientation);

  const lat0 = center.lat;
  const lng0 = center.lng;

  return corners.map((c) => {
    const lat = lat0 + metersToLatDegrees(y + c.y);
    const lng = lng0 + metersToLngDegrees(x + c.x, lat0);
    return [lat, lng] as [number, number];
  });
}

function axialRing(radius: number): HexAxial[] {
  const out: HexAxial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
}

function makeDefaultGrid(ringCount: number): { coords: HexAxial[]; baseZones: DeliveryHexZone[] } {
  const coords = axialRing(ringCount);

  // stable deterministic ordering: by distance then r then q
  coords.sort((a, b) => {
    const da = Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(-a.q - a.r));
    const db = Math.max(Math.abs(b.q), Math.abs(b.r), Math.abs(-b.q - b.r));
    if (da !== db) return da - db;
    if (a.r !== b.r) return a.r - b.r;
    return a.q - b.q;
  });

  const baseZones: DeliveryHexZone[] = coords.map((_, i) => ({
    id: `hex-${i + 1}`,
    name: `Bölge ${i + 1}`,
    isActive: false,
    minOrderAmount: 0,
    feeAmount: 0,
  }));

  return { coords, baseZones };
}

export default function DeliveryZoneMap({
  center = { lat: 35.1856, lng: 33.3823 },
  zones,
  selectedZoneId = null,
  gridSettings,
  onSelectZone,
  onToggleZone,
  height = 420,
}: Props) {
  const safeSize = clamp(Number(gridSettings?.cellSizeMeters) || 650, 150, 4000);
  const safeRadius = clamp(Number(gridSettings?.radiusMeters) || 3000, 200, 20_000);
  const safeRing = ringCountFromRadius(safeRadius, safeSize);
  const orientation: "flat" | "pointy" =
    gridSettings?.orientation === "pointy" ? "pointy" : "flat";

  const computed = React.useMemo(() => makeDefaultGrid(safeRing), [safeRing]);

  // Merge persisted zones onto deterministic base ids.
  const effectiveZones = React.useMemo(() => {
    const base = computed.baseZones;
    if (!zones || zones.length === 0) return base;

    const byId = new Map(zones.map((z) => [String(z.id), z]));
    return base.map((b) => {
      const z = byId.get(String(b.id));
      if (!z) return b;
      return {
        id: String(z.id),
        name: typeof z.name === "string" && z.name.trim() ? z.name : b.name,
        isActive: z.isActive !== false,
        minOrderAmount: Number(z.minOrderAmount ?? b.minOrderAmount) || 0,
        feeAmount: Number(z.feeAmount ?? b.feeAmount) || 0,
      };
    });
  }, [computed.baseZones, zones]);

  return (
    <div style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        doubleClickZoom={false}
        style={{ height: "100%", width: "100%", borderRadius: 12 }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Pane name="hexPane" style={{ zIndex: 650 }}>
          {/* Restaurant location pin */}
          {Number.isFinite(center?.lat) && Number.isFinite(center?.lng) ? (
            <CircleMarker
              center={[center.lat, center.lng]}
              radius={10}
              pane="hexPane"
              pathOptions={{
                color: "#111827",
                fillColor: "#F59E0B",
                fillOpacity: 0.95,
                weight: 2,
              }}
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

          {/* Hex cells */}
          {effectiveZones.map((z, i) => {
            const ax = computed.coords[i] || { q: 0, r: 0 };
            const pts = axialHexToLatLngPolygon(center, ax, safeSize, orientation);
            const isSelected = String(selectedZoneId || "") === String(z.id);

            const strokeColor = isSelected ? "#6D28D9" : z.isActive ? "#16A34A" : "#64748B";
            const fillColor = isSelected ? "#8B5CF6" : z.isActive ? "#22C55E" : "#94A3B8";

            const base = {
              color: strokeColor,
              fillColor,
              weight: isSelected ? 3.5 : 2.5,
              opacity: z.isActive ? 0.95 : 0.85,
              fillOpacity: z.isActive ? (isSelected ? 0.28 : 0.18) : isSelected ? 0.14 : 0.08,
            } as any;

            const title = typeof z.name === "string" && z.name.trim() ? z.name : `Bölge ${i + 1}`;

            return (
              <Polygon
                key={z.id}
                positions={pts}
                pathOptions={base}
                pane="hexPane"
                eventHandlers={{
                  click: () => onSelectZone(z.id),
                  dblclick: () => onToggleZone(z.id, !z.isActive),
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
                    <div style={{ marginBottom: 6 }}>
                      Durum: <b>{z.isActive ? "Açık" : "Kapalı"}</b>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      Minimum sepet: <b>{Number(z.minOrderAmount || 0).toFixed(0)}</b>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      Teslimat ücreti: <b>{Number(z.feeAmount || 0).toFixed(0)}</b>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => onToggleZone(z.id, !z.isActive)}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        {z.isActive ? "Kapat" : "Aç"}
                      </button>
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}
        </Pane>
      </MapContainer>
    </div>
  );
}