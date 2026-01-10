import React from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Pane } from "react-leaflet";

// NOTE:
// Hex netleştiği için bu bileşen artık polygon çizdirmez.
// Getir benzeri şekilde merkez etrafında hex hücreler üretir, listeler ve seçime izin verir.

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

  // Grid controls
  ringCount?: number; // how many rings from center (default: 2 => 19 cells)
  cellSizeMeters?: number; // hex "size" (center->corner) in meters

  // UI callbacks
  onSelectZone: (zoneId: string) => void;
  onToggleZone: (zoneId: string, isActive: boolean) => void;

  // optional helper action (SettingsPage can call, but component also provides a button)
  onGenerateDefaultZones?: (zones: DeliveryHexZone[]) => void;

  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// --- Hex math (pointy-top axial coords) ---
// Pixel-ish layout in meters (flat approximation; good enough for city-scale delivery)
//
// pointy-top axial -> world meters:
// x = size * sqrt(3) * (q + r/2)
// y = size * 3/2 * r
//
// Then convert meters to lat/lng degrees around center.

function metersToLatDegrees(m: number) {
  // ~111_320m per latitude degree
  return m / 111_320;
}

function metersToLngDegrees(m: number, atLat: number) {
  const latRad = (atLat * Math.PI) / 180;
  // ~111_320m * cos(lat) per longitude degree
  const denom = 111_320 * Math.cos(latRad);
  return denom === 0 ? 0 : m / denom;
}

function axialToMeters(ax: HexAxial, size: number) {
  const x = size * Math.sqrt(3) * (ax.q + ax.r / 2);
  const y = size * (3 / 2) * ax.r;
  return { x, y };
}

function hexCornerOffsetsMeters(size: number) {
  // pointy-top corners: angle 30 + i*60
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((30 + 60 * i) * Math.PI) / 180;
    corners.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return corners;
}

function axialHexToLatLngPolygon(center: { lat: number; lng: number }, ax: HexAxial, sizeMeters: number) {
  const { x, y } = axialToMeters(ax, sizeMeters);
  const corners = hexCornerOffsetsMeters(sizeMeters);

  // Convert local meters to lat/lng deltas
  const lat0 = center.lat;
  const lng0 = center.lng;

  const pts = corners.map((c) => {
    const lat = lat0 + metersToLatDegrees(y + c.y);
    const lng = lng0 + metersToLngDegrees(x + c.x, lat0);
    return [lat, lng] as [number, number];
  });

  return pts;
}

function axialRing(radius: number): HexAxial[] {
  // returns all coords within radius (including center)
  const out: HexAxial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
}

function makeDefaultZones(ringCount: number): { zones: DeliveryHexZone[]; coords: HexAxial[] } {
  const coords = axialRing(ringCount);
  // stable deterministic ordering: by distance then r then q
  coords.sort((a, b) => {
    const da = Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(-a.q - a.r));
    const db = Math.max(Math.abs(b.q), Math.abs(b.r), Math.abs(-b.q - b.r));
    if (da !== db) return da - db;
    if (a.r !== b.r) return a.r - b.r;
    return a.q - b.q;
  });

  const zones: DeliveryHexZone[] = coords.map((c, i) => {
    const idx = i + 1;
    return {
      id: `hex-${idx}`,
      name: `Bölge ${idx}`,
      isActive: false,
      minOrderAmount: 0,
      feeAmount: 0,
    };
  });

  return { zones, coords };
}

export default function DeliveryZoneMap({
  center = { lat: 35.1856, lng: 33.3823 },
  zones,
  selectedZoneId = null,
  ringCount = 2,
  cellSizeMeters = 650,
  onSelectZone,
  onToggleZone,
  onGenerateDefaultZones,
  height = 420,
}: Props) {
  const safeRing = clamp(Number(ringCount) || 2, 1, 6);
  const safeSize = clamp(Number(cellSizeMeters) || 650, 150, 4000);

  const computed = React.useMemo(() => makeDefaultZones(safeRing), [safeRing]);

  // Merge persisted zones (SettingsPage) onto deterministic grid ids.
  // If some ids are missing, fall back to defaults.
  const effectiveZones = React.useMemo(() => {
    const base = computed.zones;
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
  }, [computed.zones, zones]);

  const handleGenerate = () => {
    if (typeof onGenerateDefaultZones === "function") {
      onGenerateDefaultZones(computed.zones);
    }
  };

  return (
    <div style={{ height }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Hex teslimat bölgeleri: {effectiveZones.length} hücre (ring={safeRing}, çap~{Math.round(safeSize * 2)}m)
        </div>
        {typeof onGenerateDefaultZones === "function" ? (
          <button
            type="button"
            onClick={handleGenerate}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "white",
              cursor: "pointer",
            }}
            title="Varsayılan hex grid oluştur (hex-1..hex-N / Bölge 1..N)"
          >
            Varsayılan Grid Oluştur
          </button>
        ) : null}
      </div>

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
          {/* Restaurant location pin (always visible) */}
          {Number.isFinite(center?.lat) && Number.isFinite(center?.lng) ? (
            <CircleMarker
              center={[center.lat, center.lng]}
              radius={10}
              pane="hexPane"
              pathOptions={{ color: "#111827", fillColor: "#F59E0B", fillOpacity: 0.95, weight: 2 }}
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
            const pts = axialHexToLatLngPolygon(center, ax, safeSize);
            const isSelected = String(selectedZoneId || "") === String(z.id);

            const strokeColor = isSelected ? "#6D28D9" : z.isActive ? "#16A34A" : "#64748B";
            const fillColor = isSelected ? "#8B5CF6" : z.isActive ? "#22C55E" : "#94A3B8";

            const base = {
              color: strokeColor,
              fillColor,
              weight: isSelected ? 3.5 : 2.5,
              opacity: z.isActive ? 0.95 : 0.85,
              fillOpacity: z.isActive ? (isSelected ? 0.28 : 0.18) : (isSelected ? 0.14 : 0.08),
            } as any;

            const title = typeof z.name === "string" && z.name.trim() ? z.name : z.id;

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
                      <span style={{ fontSize: 11, opacity: 0.75, alignSelf: "center" }}>
                        Çift tık: hızlı aç/kapat
                      </span>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
                      Hex index: q={ax.q}, r={ax.r}
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