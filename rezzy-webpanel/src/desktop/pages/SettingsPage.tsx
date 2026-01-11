// src/desktop/SettingsPage.tsx
import React from "react";
import { getCurrencySymbolForRegion } from "../../utils/currency";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import {
  DesktopThemeKey,
  getInitialDesktopTheme,
  setDesktopTheme,
} from "../theme";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import {
  restaurantGet,
  restaurantUpdateProfile,
  restaurantAddPhoto,
  restaurantRemovePhoto,
  api,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { parseLatLngFromGoogleMaps } from "../../utils/geo";
import { Card } from "../../components/Card";
import DeliveryZoneMap from "../components/DeliveryZoneMap";

// === Tipler ===
type OpeningHour = { day: number; open: string; close: string; isClosed?: boolean };
type MenuItem = { name: string; price: number; description?: string; isActive?: boolean };
type TableItem = { _id?: string; name: string; capacity: number; isActive?: boolean };
type Policies = {
  minPartySize: number;
  maxPartySize: number;
  slotMinutes: number;
  depositRequired: boolean;
  depositAmount: number;
  blackoutDates: string[];
  checkinWindowBeforeMinutes: number;
  checkinWindowAfterMinutes: number;
};

type GeoPoint = { type?: "Point"; coordinates: [number, number] }; // [lng, lat]

type DeliveryGridSettings = {
  cellSizeMeters: number; // hex radius/size in meters
  radiusMeters: number; // how far to generate grid from restaurant center
  orientation?: "flat" | "pointy";
};

type DeliveryZoneState = {
  id: string; // deterministic hex id (q:r or similar)
  name?: string; // optional label shown in UI (e.g., Bölge 1)
  isActive: boolean;
  minOrderAmount: number;
  feeAmount: number;
};

type Restaurant = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  region?: string;
  city?: string;
  address?: string;
  description?: string;
  photos?: string[];
  logo?: string;

  iban?: string;
  ibanName?: string;
  bankName?: string;

  mapAddress?: string;
  placeId?: string;
  googleMapsUrl?: string;
  location?: GeoPoint;

  delivery?: {
    enabled?: boolean;
    paymentOptions?: {
      online?: boolean;
      cashOnDelivery?: boolean;
      cardOnDelivery?: boolean;
    };
    // Global defaults (optional)
    minOrderAmount?: number;
    feeAmount?: number;
    // Hex grid settings
    gridSettings?: DeliveryGridSettings;
    // Per-hex overrides
    zones?: DeliveryZoneState[];
  };

  menus?: any[];
  tables?: TableItem[];
  openingHours?: OpeningHour[];
  minPartySize?: number;
  maxPartySize?: number;
  slotMinutes?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  blackoutDates?: string[];
  checkinWindowBeforeMinutes: number;
  checkinWindowAfterMinutes: number;
};

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const DEFAULT_OPENING_HOURS: OpeningHour[] = Array.from(
  { length: 7 },
  (_, i) => ({
    day: i,
    open: "10:00",
    close: "23:00",
    isClosed: false,
  })
);

const DEFAULT_POLICIES: Policies = {
  minPartySize: 1,
  maxPartySize: 8,
  slotMinutes: 90,
  depositRequired: false,
  depositAmount: 0,
  blackoutDates: [],
  checkinWindowBeforeMinutes: 15,
  checkinWindowAfterMinutes: 90,
};

// 🔹 Tablara tema sekmesini de ekliyoruz
type TabKey =
  | "general"
  | "photos"
  | "menus"
  | "tables"
  | "hours"
  | "policies"
  | "delivery"
  | "theme";

type SettingsForm = Partial<
  Restaurant & {
    location?: { coordinates?: [number, number] };
    mapAddress?: string;
    googleMapsUrl?: string;
    placeId?: string;
  }
>;

const THEME_OPTIONS: { key: DesktopThemeKey; label: string; description: string }[] = [
  {
    key: "rezvix-classic",
    label: "Rezvix Classic",
    description: "Rezvix’nin bordo kimliğiyle uyumlu, dengeli koyu tema.",
  },
  {
    key: "crystal-dark",
    label: "Crystal Dark",
    description: "Premium, hafif koyu ve cam efekti ağırlıklı görünüm.",
  },
  {
    key: "dark-latte",
    label: "Dark Latte",
    description: "Orta koyu, daha ferah ve uzun kullanımda daha rahat.",
  },
  {
    key: "deep-bronze",
    label: "Deep Bronze",
    description: "Sıcak altın tonlarıyla restoran ambiyansına uygun.",
  },
  {
    key: "light-pos",
    label: "Light POS",
    description: "iPad POS tarzı, açık ve yüksek kontrastlı görünüm.",
  },
];

export const SettingsPage: React.FC = () => {
  const user = authStore.getUser();

  // ✅ Önce legacy restaurantId, yoksa membership'ten ilk restoran
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;

  const rid =
    asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const qc = useQueryClient();

  const [tab, setTab] = React.useState<TabKey>("general");

  // 🔹 Tema durumu (sadece local / desktop)
  const [selectedTheme, setSelectedTheme] = React.useState<DesktopThemeKey>(() =>
    getInitialDesktopTheme()
  );

  const { data, isLoading, error } = useQuery<Restaurant>({
    queryKey: ["restaurant-detail", rid],
    queryFn: () => restaurantGet(rid),
    enabled: !!rid,
  });
  const {
    data: deliverySettingsData,
    isLoading: isDeliverySettingsLoading,
    error: deliverySettingsError,
  } = useQuery<any>({
    queryKey: ["delivery-settings", rid],
    queryFn: async () => {
      try {
        return (await api.get(`/restaurants/${rid}/delivery-settings`)).data;
      } catch (e: any) {
        // Some environments only support PUT for delivery-settings and return 404 on GET.
        // We treat 404 as "no dedicated delivery-settings resource" and fall back to restaurant detail.
        const status = e?.response?.status;
        if (status === 404) return null;
        throw e;
      }
    },
    retry: false,
    enabled: !!rid,
  });
  const currencySymbol = getCurrencySymbolForRegion(data?.region);

  const [form, setForm] = React.useState<SettingsForm>({});
  const [menus, setMenus] = React.useState<MenuItem[]>([]);
  const [tables, setTables] = React.useState<TableItem[]>([]);
  const [hours, setHours] = React.useState<OpeningHour[]>(DEFAULT_OPENING_HOURS);
  const [policies, setPolicies] = React.useState<Policies>(DEFAULT_POLICIES);
  const [newBlackout, setNewBlackout] = React.useState("");
  const [deliveryEnabled, setDeliveryEnabled] = React.useState<boolean>(false);
  const [deliveryZones, setDeliveryZones] = React.useState<DeliveryZoneState[]>([]);
  const [gridSettings, setGridSettings] = React.useState<DeliveryGridSettings>({
    cellSizeMeters: 450,
    radiusMeters: 3000,
    orientation: "pointy",
  });
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(null);
  const hydratedDeliveryOnceRef = React.useRef(false);

  // === Helper: Varsayılan HEX grid hücreleri (Bölge 1..N) ===
  const placeholderZonesCreatedRef = React.useRef(false);

  const createPlaceholderZones = React.useCallback((): DeliveryZoneState[] => {
    // Getir benzeri başlangıç grid’i (merkez + 2 halka ≈ 19 hücre)
    return Array.from({ length: 19 }, (_, i) => ({
      id: `hex-${i + 1}`,
      name: `Bölge ${i + 1}`,
      isActive: false,
      minOrderAmount: 0,
      feeAmount: 0,
    }));
  }, []);

  // Delivery map center (prefer saved restaurant location)
  const deliveryMapCenter = React.useMemo(() => {
    const lng = Number((form as any)?.location?.coordinates?.[0] ?? 0);
    const lat = Number((form as any)?.location?.coordinates?.[1] ?? 0);
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
    return hasLoc ? { lat, lng } : undefined;
  }, [form]);

  // ✅ Paket servis açık + konum var + bölgeler yoksa, placeholder grid otomatik oluştur
  React.useEffect(() => {
    if (!deliveryEnabled) return;
    if (!deliveryMapCenter) return;
    if (deliveryZones.length > 0) return;

    setDeliveryZones(createPlaceholderZones());

    // Kullanıcıyı her render'da rahatsız etmemek için sadece ilk seferde bilgi ver
    if (!placeholderZonesCreatedRef.current) {
      placeholderZonesCreatedRef.current = true;
      showToast(
        "Varsayılan teslimat bölgeleri oluşturuldu. Haritada tıklayıp aktif/pasif yapabilir ve düzenleyebilirsiniz.",
        "success"
      );
    }
  }, [deliveryEnabled, deliveryMapCenter, deliveryZones.length, createPlaceholderZones]);

  // 🔹 QR poster indirme durumları
  const [isDownloadingAllPosters, setIsDownloadingAllPosters] = React.useState(false);
  const [downloadingTableKey, setDownloadingTableKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!data) return;

    setForm({
      name: data.name,
      email: data.email,
      phone: data.phone,
      region: data.region ?? "",
      city: data.city,
      address: data.address,
      description: data.description,
      iban: data.iban,
      ibanName: data.ibanName,
      bankName: data.bankName,
      mapAddress: data.mapAddress ?? "",
      placeId: data.placeId ?? "",
      googleMapsUrl: data.googleMapsUrl ?? "",
      location:
        data.location && Array.isArray((data.location as any).coordinates)
          ? {
              type: "Point",
              coordinates: [
                Number((data.location as any).coordinates[0]) || 0, // lng
                Number((data.location as any).coordinates[1]) || 0, // lat
              ],
            }
          : { type: "Point", coordinates: [0, 0] },
    });

    setMenus(
      Array.isArray(data.menus)
        ? data.menus.map((m: any) => ({
            name: m.name ?? m.title ?? "",
            price: Number(m.price ?? m.pricePerPerson ?? 0),
            description: m.description ?? "",
            isActive: m.isActive ?? true,
          }))
        : []
    );

    setTables(Array.isArray(data.tables) ? data.tables : []);

    setHours(
      Array.isArray(data.openingHours) && data.openingHours.length === 7
        ? data.openingHours
        : DEFAULT_OPENING_HOURS
    );

    setPolicies({
      minPartySize: data.minPartySize ?? DEFAULT_POLICIES.minPartySize,
      maxPartySize: data.maxPartySize ?? DEFAULT_POLICIES.maxPartySize,
      slotMinutes: data.slotMinutes ?? DEFAULT_POLICIES.slotMinutes,
      depositRequired: data.depositRequired ?? DEFAULT_POLICIES.depositRequired,
      depositAmount: data.depositAmount ?? DEFAULT_POLICIES.depositAmount,
      blackoutDates: Array.isArray(data.blackoutDates) ? data.blackoutDates : [],
      checkinWindowBeforeMinutes:
        typeof data.checkinWindowBeforeMinutes === "number"
          ? data.checkinWindowBeforeMinutes
          : DEFAULT_POLICIES.checkinWindowBeforeMinutes,
      checkinWindowAfterMinutes:
        typeof data.checkinWindowAfterMinutes === "number"
          ? data.checkinWindowAfterMinutes
          : DEFAULT_POLICIES.checkinWindowAfterMinutes,
    });

    // --- Delivery settings hydrate ---
    // Prefer /delivery-settings (authoritative), but gracefully fall back to restaurant detail.
    const dsRaw: any =
      (deliverySettingsData ?? undefined) ??
      (data as any).delivery ??
      (data as any).deliverySettings ??
      undefined;

    // Some shapes might be { delivery: { ... } }, normalize it.
    const ds: any = dsRaw?.delivery ? dsRaw.delivery : dsRaw;

    const nextDeliveryEnabled = !!(
      ds?.enabled ??
      (data as any).delivery?.enabled ??
      false
    );

    setDeliveryEnabled(nextDeliveryEnabled);

    // Only overwrite grid settings if we have a value from backend; otherwise keep current state.
    if (ds?.gridSettings || (data as any).delivery?.gridSettings || !hydratedDeliveryOnceRef.current) {
      const gs = ds?.gridSettings ?? (data as any).delivery?.gridSettings;
      setGridSettings((prev) => ({
        ...prev,
        cellSizeMeters: Number(gs?.cellSizeMeters ?? prev.cellSizeMeters ?? 450),
        radiusMeters: Number(gs?.radiusMeters ?? prev.radiusMeters ?? 3000),
        orientation: "pointy",
      }));
    }

    // IMPORTANT: Do NOT reset zones to [] just because restaurant detail doesn't include them.
    // Only overwrite when backend returns zones; otherwise preserve current UI state.
    if (Array.isArray(ds?.zones)) {
      setDeliveryZones(
        ds.zones
          .map((z: any) => ({
            id: String(z?.id ?? ""),
            name: typeof z?.name === "string" ? z.name : undefined,
            isActive: z?.isActive !== false,
            minOrderAmount: Number(z?.minOrderAmount ?? 0),
            feeAmount: Number(z?.feeAmount ?? 0),
          }))
          .filter((z: any) => !!z.id)
      );
    } else if (!hydratedDeliveryOnceRef.current) {
      // First hydration: if restaurant detail happens to include zones, use them.
      const rz = (data as any).delivery?.zones;
      if (Array.isArray(rz)) {
        setDeliveryZones(
          rz
            .map((z: any) => ({
              id: String(z?.id ?? ""),
              name: typeof z?.name === "string" ? z.name : undefined,
              isActive: z?.isActive !== false,
              minOrderAmount: Number(z?.minOrderAmount ?? 0),
              feeAmount: Number(z?.feeAmount ?? 0),
            }))
            .filter((z: any) => !!z.id)
        );
      }
    }

    setSelectedZoneId(null);
    hydratedDeliveryOnceRef.current = true;
  }, [data, deliverySettingsData]);

  // === Yardımcı: Content-Disposition başlığından dosya adı çek ===
  const getFilenameFromContentDisposition = (header?: string | null) => {
    if (!header) return null;
    const match = /filename="?([^"]+)"?/i.exec(header);
    return match?.[1] || null;
  };

  // === Yardımcı: Blob indir ===
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Some browsers can cancel the download if the object URL is revoked too quickly.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // === Tek masa için A5 QR poster indir ===
  const downloadPosterForTable = async (table: TableItem) => {
    try {
      const tableKey = table._id || table.name;
      if (!tableKey) {
        showToast("Bu masa için geçerli bir anahtar bulunamadı", "error");
        return;
      }

      setDownloadingTableKey(String(tableKey));

      const res = await api.get(
        `/qr/poster/${rid}/${encodeURIComponent(String(tableKey))}`,
        {
          responseType: "blob",
        }
      );

      const cd = getFilenameFromContentDisposition(
        (res as any).headers?.["content-disposition"] ||
          (res as any).headers?.["Content-Disposition"]
      );

      const filename =
        cd ||
        `Rezvix-QR-Poster-${
          (data?.name || "Restaurant").replace(/[^\w\-]+/g, "_") || "Restaurant"
        }-${(table.name || "Table").replace(/[^\w\-]+/g, "_")}.pdf`;

      triggerDownload(res.data as Blob, filename);
    } catch (e: any) {
      showToast(
        e?.response?.data?.message || e?.message || "QR posteri indirilemedi",
        "error"
      );
    } finally {
      setDownloadingTableKey(null);
    }
  };

  // === Tüm masalar için ZIP indir ===
  const downloadAllPostersZip = async () => {
    try {
      setIsDownloadingAllPosters(true);

      const res = await api.get(`/qr/posters/${rid}`, {
        responseType: "blob",
      });

      const cd = getFilenameFromContentDisposition(
        (res as any).headers?.["content-disposition"] ||
          (res as any).headers?.["Content-Disposition"]
      );

      const safeRestaurant =
        (data?.name || "Restaurant").replace(/[^\w\-]+/g, "_") ||
        "Restaurant";

      const filename = cd || `Rezvix-Table-Posters-${safeRestaurant}.zip`;

      triggerDownload(res.data as Blob, filename);
    } catch (e: any) {
      showToast(
        e?.response?.data?.message ||
          e?.message ||
          "QR poster paketi indirilemedi",
        "error"
      );
    } finally {
      setIsDownloadingAllPosters(false);
    }
  };

  // === Mutations ===

  const saveDeliveryZonesMut = useMutation({
    mutationFn: async () => {
      const lng = Number(form.location?.coordinates?.[0] ?? 0);
      const lat = Number(form.location?.coordinates?.[1] ?? 0);

      if (deliveryEnabled) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) {
          showToast("Paket servis için önce restoran konumunu kaydedin (Lat/Lng)", "error");
          throw new Error("Missing restaurant location for delivery");
        }
      }

      const normalizedGridSettings = {
        cellSizeMeters: Math.max(50, Number(gridSettings.cellSizeMeters) || 450),
        radiusMeters: Math.max(200, Number(gridSettings.radiusMeters) || 3000),
        orientation: "pointy",
      } as const;

      const normalizedZones = Array.isArray(deliveryZones)
        ? deliveryZones.map((z) => ({
            id: String(z.id),
            name: typeof z.name === "string" ? z.name : undefined,
            isActive: z.isActive !== false,
            minOrderAmount: Math.max(0, Number(z.minOrderAmount) || 0),
            feeAmount: Math.max(0, Number(z.feeAmount) || 0),
          }))
        : [];

      // Some backends expect delivery fields at root, some expect them nested under `delivery`.
      // To avoid 400 "No valid fields to update", we send BOTH shapes.
      const deliveryFields: any = {
        enabled: !!deliveryEnabled,
        gridSettings: normalizedGridSettings,
        zones: normalizedZones,
      };

      const payload: any = {
        ...deliveryFields,
        delivery: deliveryFields,
      };

      // also update restaurant location if we have it
      if (
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        (lng !== 0 || lat !== 0)
      ) {
        payload.location = { type: "Point", coordinates: [lng, lat] };
      }

      await api.put(`/restaurants/${rid}/delivery-settings`, payload);
    },
    onSuccess: () => {
      showToast("Teslimat bölgeleri güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["delivery-settings", rid] });
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        (typeof e === "string" ? e : null) ||
        "Teslimat bölgeleri kaydedilemedi";
      showToast(msg, "error");
    },
  });

  const saveGeneralMut = useMutation({
    mutationFn: () => {
      const lng = Number(form.location?.coordinates?.[0] ?? 0);
      const lat = Number(form.location?.coordinates?.[1] ?? 0);

      const payload: any = {
        ...form,
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        mapAddress: form.mapAddress ?? "",
        placeId: form.placeId ?? "",
        googleMapsUrl: form.googleMapsUrl ?? "",
      };

      const region = (form as any).region?.trim().toUpperCase();
      if (region) {
        payload.region = region;
      }

      return restaurantUpdateProfile(rid, payload);
    },
    onSuccess: () => {
      showToast("Kaydedildi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Kaydedilemedi",
        "error"
      ),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => restaurantAddPhoto(rid, file),
    onSuccess: () => {
      showToast("Fotoğraf yüklendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Fotoğraf yüklenemedi",
        "error"
      ),
  });

  const removePhotoMut = useMutation({
    mutationFn: (url: string) => restaurantRemovePhoto(rid, url),
    onSuccess: () => {
      showToast("Silindi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Silinemedi",
        "error"
      ),
  });

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => api.postForm(`/restaurants/${rid}/logo`, { file }),
    onSuccess: ()=>{
      showToast("Logo yüklendi","success");
      qc.invalidateQueries({queryKey:["restaurant-detail",rid]});
    },
    onError:(e:any)=> showToast(e?.response?.data?.message||"Logo yüklenemedi","error")
  });

  const saveMenusMut = useMutation({
    mutationFn: async () => {
      const payload = menus.map((m) => ({
        title: m.name,
        pricePerPerson: m.price,
        description: m.description || "",
        isActive: m.isActive ?? true,
      }));
      await api.put(`/restaurants/${rid}/menus`, { menus: payload });
    },
    onSuccess: () => {
      showToast("Menüler güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Menüler kaydedilemedi",
        "error"
      ),
  });

  const saveTablesMut = useMutation({
    mutationFn: async () => {
      await api.put(`/restaurants/${rid}/tables`, { tables });
    },
    onSuccess: () => {
      showToast("Masalar güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Masalar kaydedilemedi",
        "error"
      ),
  });

  const saveHoursMut = useMutation({
    mutationFn: async () => {
      await api.put(`/restaurants/${rid}/opening-hours`, {
        openingHours: hours,
      });
    },
    onSuccess: () => {
      showToast("Çalışma saatleri güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Saatler kaydedilemedi",
        "error"
      ),
  });

  const savePoliciesMut = useMutation({
    mutationFn: async () => {
      const payload = {
        minPartySize: Math.max(1, policies.minPartySize),
        maxPartySize: Math.max(policies.minPartySize, policies.maxPartySize),
        slotMinutes: Math.max(30, policies.slotMinutes),
        depositRequired: !!policies.depositRequired,
        depositAmount: Math.max(0, policies.depositAmount),
        blackoutDates: policies.blackoutDates,
        checkinWindowBeforeMinutes: Math.max(
          0,
          policies.checkinWindowBeforeMinutes
        ),
        checkinWindowAfterMinutes: Math.max(
          0,
          policies.checkinWindowAfterMinutes
        ),
      };
      await api.put(`/restaurants/${rid}/policies`, payload);
    },
    onSuccess: () => {
      showToast("Politikalar güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message || e?.message || "Politikalar kaydedilemedi",
        "error"
      ),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMut.mutate(f);
    e.currentTarget.value = "";
  };

  const handleSelectTheme = (key: DesktopThemeKey) => {
    setSelectedTheme(key);
    setDesktopTheme(key); // sadece bu bilgisayarda geçerli
  };

  const TabBar = (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["general", "Genel"],
          ["photos", "Fotoğraflar"],
          ["menus", "Menüler"],
          ["tables", "Masalar"],
          ["hours", "Saatler"],
          ["policies", "Politikalar"],
          ["delivery", "Teslimat"],
          ["theme", "Tema"],
        ] as Array<[TabKey, string]>
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={
            "px-3 py-1.5 rounded-lg text-sm " +
            (tab === k
              ? "bg-brand-600 text-white"
              : "bg-gray-100 hover:bg-gray-200")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );


  // --- Delivery zone helpers (map/table shared) ---
  const toggleZoneActive = React.useCallback((zoneId: string) => {
    setDeliveryZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, isActive: !z.isActive } : z))
    );
  }, []);

  const selectZone = React.useCallback((zoneId: string | null) => {
    setSelectedZoneId(zoneId);
  }, []);

  const updateZonePatch = React.useCallback(
    (zoneId: string, patch: Partial<DeliveryZoneState>) => {
      setDeliveryZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, ...patch } : z))
      );
    },
    []
  );

  return (
    <RestaurantDesktopLayout
      activeNav="settings"
      title="Ayarlar"
      subtitle="Restoran profilinizi, rezervasyon politikalarınızı ve masaüstü temasını yönetin."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">Profil & Ayarlar</h2>
          {TabBar}
        </div>

        {isLoading && <div>Yükleniyor…</div>}
        {error && (
          <div className="text-red-600 text-sm">Bilgiler alınamadı</div>
        )}

        {/* === GENEL === */}
        {tab === "general" && (
          <Card title="Temel Bilgiler">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ad */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Ad</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.name || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  E-posta
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.email || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Telefon
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.phone || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>

              {/* Bölge */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Bölge (ülke kodu)
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="TR, CY, UK..."
                  value={(form as any).region || ""}
                  onChange={(e) =>
                    setForm(
                      (f) =>
                        ({
                          ...f,
                          region: e.target.value,
                        } as any)
                    )
                  }
                />
                <p className="mt-1 text-xs text-gray-500">
                  2-3 harfli ISO ülke kodu girin (örn. TR, CY, UK).
                </p>
              </div>

              {/* Şehir */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Şehir
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.city || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>

              {/* Adres */}
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Adres
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.address || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>

              {/* Açıklama */}
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Açıklama
                </label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 h-40"
                  value={form.description || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>

              {/* Ödeme bilgileri */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  IBAN
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="TR.."
                  value={form.iban || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, iban: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  IBAN Adı
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Hesap Sahibi"
                  value={form.ibanName || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ibanName: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Banka Adı
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.bankName || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bankName: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* --- Konum Bilgileri --- */}
            <div className="md:col-span-2 border-t pt-4 mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Konum Bilgileri
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Harita Adresi
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="Google Harita üzerindeki adres"
                    value={form.mapAddress || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mapAddress: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Google Maps URL
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="https://maps.google.com/?q=..."
                    value={form.googleMapsUrl || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({ ...f, googleMapsUrl: val }));

                      const parsed = parseLatLngFromGoogleMaps(val);
                      if (parsed) {
                        setForm((f) => ({
                          ...f,
                          location: {
                            type: "Point",
                            coordinates: [parsed.lng, parsed.lat],
                          },
                        }));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Latitude (enlem)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={form.location?.coordinates?.[1] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        location: {
                          ...f.location,
                          coordinates: [
                            f.location?.coordinates?.[0] ?? 0,
                            parseFloat(e.target.value) || 0,
                          ],
                        },
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Longitude (boylam)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={form.location?.coordinates?.[0] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        location: {
                          ...f.location,
                          coordinates: [
                            parseFloat(e.target.value) || 0,
                            f.location?.coordinates?.[1] ?? 0,
                          ],
                        },
                      }))
                    }
                  />
                </div>
              </div>

              {form.location?.coordinates?.[1] &&
                form.location?.coordinates?.[0] && (
                  <div className="mt-4">
                    <iframe
                      title="map"
                      width="100%"
                      height="250"
                      className="rounded-lg border"
                      loading="lazy"
                      src={`https://www.google.com/maps?q=${form.location.coordinates[1]},${form.location.coordinates[0]}&hl=tr&z=16&output=embed`}
                    />
                  </div>
                )}
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveGeneralMut.mutate()}
                disabled={saveGeneralMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
              >
                {saveGeneralMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === FOTOĞRAFLAR === */}
        {tab === "photos" && (
          <Card title="Fotoğraflar">
            <div className="mb-3 flex items-center gap-3">
              <input type="file" accept="image/*" onChange={onFile} />
              {uploadMut.isPending && (
                <span className="text-sm text-gray-500">Yükleniyor…</span>
              )}
            </div>

            {/* === Logo Yükleme Alanı === */}
            <div className="mb-4 border p-3 rounded-lg bg-gray-50">
              <div className="mb-2 font-medium">Restoran Logosu</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogoMut.mutate(f);
                  e.currentTarget.value = "";
                }}
              />
              {uploadLogoMut.isPending && <span className="text-sm text-gray-500 ml-2">Yükleniyor…</span>}
              {data?.logo && (
                <div className="mt-3">
                  <img src={data.logo} alt="logo" className="h-20 object-contain border rounded-md p-2 bg-white" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(data?.photos ?? []).map((url) => (
                <div
                  key={url}
                  className="relative group rounded-xl overflow-hidden border"
                >
                  <img
                    src={url}
                    alt="photo"
                    className="w-full h-40 object-cover"
                  />
                  <button
                    onClick={() => removePhotoMut.mutate(url)}
                    disabled={removePhotoMut.isPending}
                    className="absolute top-2 right-2 text-xs rounded-md bg-black/60 text-white px-2 py-1 opacity-0 group-hover:opacity-100 disabled:opacity-60"
                  >
                    Sil
                  </button>
                </div>
              ))}
              {(!data?.photos || data.photos.length === 0) && (
                <div className="text-sm text-gray-500">Fotoğraf yok</div>
              )}
            </div>
          </Card>
        )}

        {/* === MENÜLER === */}
        {tab === "menus" && (
          <Card title="Menüler">
            <div className="space-y-3">
              {menus.map((m, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-6 gap-3"
                >
                  {/* Ad */}
                  <input
                    className="border rounded-lg px-3 py-2"
                    placeholder="Ad"
                    value={m.name}
                    onChange={(e) =>
                      setMenus((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />

                  {/* Fiyat */}
                  <input
                    type="number"
                    min={0}
                    className="border rounded-lg px-3 py-2"
                    placeholder="Fiyat"
                    value={String(m.price)}
                    onChange={(e) =>
                      setMenus((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                price: Number(e.target.value) || 0,
                              }
                            : x
                        )
                      )
                    }
                  />

                  {/* Açıklama */}
                  <div className="md:col-span-3">
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 h-24"
                      placeholder="Açıklama"
                      value={m.description || ""}
                      onChange={(e) =>
                        setMenus((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, description: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                  </div>

                  {/* Aktif */}
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Aktif</span>
                      <input
                        type="checkbox"
                        checked={m.isActive ?? true}
                        onChange={(e) =>
                          setMenus((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, isActive: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </label>
                  </div>

                  {/* Sil */}
                  <div className="md:col-span-6">
                    <button
                      className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                      onClick={() =>
                        setMenus((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
              {menus.length === 0 && (
                <div className="text-sm text-gray-500">Kayıt yok</div>
              )}
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
                onClick={() =>
                  setMenus((prev) => [
                    ...prev,
                    { name: "", price: 0, description: "", isActive: true },
                  ])
                }
              >
                Yeni Menü
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveMenusMut.mutate()}
                disabled={saveMenusMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveMenusMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === MASALAR === */}
        {tab === "tables" && (
          <Card
            title={
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span>Masalar</span>
                <button
                  type="button"
                  onClick={downloadAllPostersZip}
                  disabled={isDownloadingAllPosters}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  {isDownloadingAllPosters
                    ? "Hazırlanıyor…"
                    : "Tüm QR posterlerini indir (ZIP)"}
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              {tables.map((t, idx) => {
                const tableKey = t._id || t.name;
                const isDownloadingThis =
                  downloadingTableKey !== null &&
                  downloadingTableKey === String(tableKey);

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center"
                  >
                    <input
                      className="border rounded-lg px-3 py-2"
                      placeholder="Ad"
                      value={t.name}
                      onChange={(e) =>
                        setTables((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      className="border rounded-lg px-3 py-2"
                      placeholder="Kapasite"
                      value={String(t.capacity)}
                      onChange={(e) =>
                        setTables((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  capacity: Number(e.target.value) || 1,
                                }
                              : x
                          )
                        )
                      }
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Aktif</span>
                      <input
                        type="checkbox"
                        checked={t.isActive ?? true}
                        onChange={(e) =>
                          setTables((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, isActive: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </label>

                    {/* Tek masa QR posteri indir */}
                    <button
                      type="button"
                      onClick={() => downloadPosterForTable(t)}
                      disabled={isDownloadingThis}
                      className="rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {isDownloadingThis ? "İndiriliyor…" : "QR poster (A5)"}
                    </button>

                    <button
                      className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                      onClick={() =>
                        setTables((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Sil
                    </button>
                  </div>
                );
              })}
              {tables.length === 0 && (
                <div className="text-sm text-gray-500">Kayıt yok</div>
              )}
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
                onClick={() =>
                  setTables((prev) => [
                    ...prev,
                    {
                      name: `Masa ${prev.length + 1}`,
                      capacity: 2,
                      isActive: true,
                    },
                  ])
                }
              >
                Yeni Masa
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveTablesMut.mutate()}
                disabled={saveTablesMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveTablesMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === SAATLER === */}
        {tab === "hours" && (
          <Card title="Çalışma Saatleri">
            <div className="space-y-3">
              {hours.map((h, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-20 text-sm text-gray-600">
                    {DAYS[h.day] ?? `Gün ${h.day}`}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Kapalı</span>
                    <input
                      type="checkbox"
                      checked={!!h.isClosed}
                      onChange={(e) =>
                        setHours((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, isClosed: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                  </label>
                  <input
                    type="time"
                    className="border rounded-lg px-3 py-2"
                    value={h.open}
                    disabled={!!h.isClosed}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, open: e.target.value } : x
                        )
                      )
                    }
                  />
                  <span>—</span>
                  <input
                    type="time"
                    className="border rounded-lg px-3 py-2"
                    value={h.close}
                    disabled={!!h.isClosed}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, close: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveHoursMut.mutate()}
                disabled={saveHoursMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveHoursMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === POLİTİKALAR === */}
        {tab === "policies" && (
          <Card title="Rezervasyon Politikaları">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Minimum kişi
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.minPartySize)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      minPartySize: Math.max(
                        1,
                        Number(e.target.value) || 1
                      ),
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Maksimum kişi
                </label>
                <input
                  type="number"
                  min={policies.minPartySize}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.maxPartySize)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      maxPartySize: Math.max(
                        p.minPartySize,
                        Number(e.target.value) || p.minPartySize
                      ),
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Slot süresi (dk)
                </label>
                <input
                  type="number"
                  min={30}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.slotMinutes)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      slotMinutes: Math.max(
                        30,
                        Number(e.target.value) || 30
                      ),
                    }))
                  }
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Check-in Penceresi (ÖNCE, dk)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.checkinWindowBeforeMinutes)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      checkinWindowBeforeMinutes: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    }))
                  }
                />
                <div className="text-xs text-gray-500 mt-1">
                  Rezervasyon saatinden <b>önce</b> kaç dakika içinde giriş
                  kabul edilir.
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Check-in Penceresi (SONRA, dk)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.checkinWindowAfterMinutes)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      checkinWindowAfterMinutes: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    }))
                  }
                />
                <div className="text-xs text-gray-500 mt-1">
                  Rezervasyon saatinden <b>sonra</b> kaç dakika içinde giriş
                  kabul edilir.
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Depozito gerekli</span>
                <input
                  type="checkbox"
                  checked={!!policies.depositRequired}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      depositRequired: e.target.checked,
                    }))
                  }
                />
              </label>

              {policies.depositRequired && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    Tutar ({currencySymbol})
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-gray-300 px-3 py-2 w-40"
                    value={String(policies.depositAmount)}
                    onChange={(e) =>
                      setPolicies((p) => ({
                        ...p,
                        depositAmount: Math.max(
                          0,
                          Number(e.target.value) || 0
                        ),
                      }))
                    }
                  />
                </div>
              )}
            </div>

            {/* Kara günler */}
            <div className="mt-6">
              <div className="mb-2 font-medium">Kara Günler (YYYY-MM-DD)</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {policies.blackoutDates.length === 0 && (
                  <div className="text-sm text-gray-500">Liste boş.</div>
                )}
                {policies.blackoutDates.map((d, i) => (
                  <div
                    key={`${d}-${i}`}
                    className="flex items-center gap-2 bg-gray-100 rounded-md px-2 py-1"
                  >
                    <span>{d}</span>
                    <button
                      className="text-red-600"
                      onClick={() =>
                        setPolicies((p) => ({
                          ...p,
                          blackoutDates: p.blackoutDates.filter(
                            (_,
                            idx) => idx !== i
                          ),
                        }))
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  placeholder="2025-12-31"
                  className="rounded-lg border border-gray-300 px-3 py-2"
                  value={newBlackout}
                  onChange={(e) => setNewBlackout(e.target.value)}
                />
                <button
                  className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                  onClick={() => {
                    const v = newBlackout.trim();
                    if (v && !policies.blackoutDates.includes(v)) {
                      setPolicies((p) => ({
                        ...p,
                        blackoutDates: [...p.blackoutDates, v],
                      }));
                      setNewBlackout("");
                    }
                  }}
                >
                  Ekle
                </button>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={() => savePoliciesMut.mutate()}
                disabled={savePoliciesMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {savePoliciesMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === TESLİMAT BÖLGELERİ === */}
        {tab === "delivery" && (
          <Card title="Teslimat Bölgeleri">
            {/* Paket servis aktif */}
            <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={deliveryEnabled}
                  onChange={(e) => setDeliveryEnabled(e.target.checked)}
                />
                <span className="text-gray-700 font-medium">Paket servis aktif</span>
              </label>
              {!deliveryEnabled && (
                <span className="text-xs text-gray-500">
                  Paket servis kapalıyken teslimat bölgeleri zorunlu değildir.
                </span>
              )}
            </div>
            {/* Grid Ayarları */}
            <div className="border rounded-lg p-3 mb-4 bg-gray-50">
              <div className="font-medium mb-2">Grid Ayarları</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Hücre Boyutu (metre)</label>
                  <input
                    type="number"
                    min={50}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={gridSettings.cellSizeMeters}
                    disabled={!deliveryEnabled}
                    onChange={e =>
                      setGridSettings(g => ({
                        ...g,
                        cellSizeMeters: Number(e.target.value) || 450,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Grid Yarıçapı (metre)</label>
                  <input
                    type="number"
                    min={200}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={gridSettings.radiusMeters}
                    disabled={!deliveryEnabled}
                    onChange={e =>
                      setGridSettings(g => ({
                        ...g,
                        radiusMeters: Number(e.target.value) || 3000,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Harita (Teslimat bölgeleri) */}
            <div className="mb-4">
              {!deliveryMapCenter ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  Harita için önce restoran konumunu kaydedin (Genel sekmesinden Lat/Lng).
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">Teslimat Haritası</div>
                    <div className="text-xs text-gray-500">
                      Hücre seçmek için tıklayın. Seçince altta “Bölge Düzenle” paneli açılır.
                    </div>
                  </div>
                  <div style={{ height: 420 }}>
                    {/*
                      NOTE: Props are intentionally passed as `any` to avoid mismatches
                      with the component's internal prop typing while keeping this page stable.
                    */}
                    <DeliveryZoneMap
                      {...({
                        center: deliveryMapCenter,
                        zones: deliveryZones,
                        gridSettings,
                        selectedZoneId,
                        deliveryEnabled,
                        onSelectZone: (id: string) => selectZone(id),
                        onToggleZone: (id: string) => toggleZoneActive(id),
                        onUpdateZone: (id: string, patch: Partial<DeliveryZoneState>) =>
                          updateZonePatch(id, patch),
                      } as any)}
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Seçili zone editörü */}
            {selectedZoneId && (
              <div className="border rounded-lg p-3 mb-4 bg-gray-50">
                <div className="font-medium mb-2">Bölge Düzenle</div>
                {(() => {
                  const idx = deliveryZones.findIndex(z => z.id === selectedZoneId);
                  if (idx === -1) return <div className="text-gray-500 text-sm">Bölge bulunamadı.</div>;
                  const z = deliveryZones[idx];
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Ad</label>
                        <input
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={z.name ?? ""}
                          disabled={!deliveryEnabled}
                          onChange={e => {
                            const v = e.target.value;
                            setDeliveryZones(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], name: v };
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Aktif</label>
                        <input
                          type="checkbox"
                          checked={z.isActive}
                          disabled={!deliveryEnabled}
                          onChange={e => {
                            setDeliveryZones(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], isActive: e.target.checked };
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min Sipariş</label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={z.minOrderAmount}
                          disabled={!deliveryEnabled}
                          onChange={e => {
                            setDeliveryZones(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], minOrderAmount: Number(e.target.value) || 0 };
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Teslimat Ücreti</label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={z.feeAmount}
                          disabled={!deliveryEnabled}
                          onChange={e => {
                            setDeliveryZones(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], feeAmount: Number(e.target.value) || 0 };
                              return next;
                            });
                          }}
                        />
                        <div className="mt-1 text-[11px] text-gray-500">Para birimi: {currencySymbol}</div>
                      </div>
                      <div className="md:col-span-4 flex items-center gap-3 mt-2">
                        <button
                          type="button"
                          className="rounded-lg bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 text-sm disabled:opacity-60"
                          disabled={!deliveryEnabled}
                          onClick={() => {
                            setDeliveryZones(prev => prev.filter((_, i) => i !== idx));
                            setSelectedZoneId(null);
                          }}
                        >
                          Bölgeyi Sil
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
                          onClick={() => selectZone(null)}
                        >
                          Düzenlemeyi Kapat
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Kaydet */}
            <div className="mt-4 flex items-center justify-end gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => saveDeliveryZonesMut.mutate()}
                disabled={saveDeliveryZonesMut.isPending || !rid}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
              >
                {saveDeliveryZonesMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === REZVIX REZERVASYONU === */}
        {/* Example usage in Rezvix rezervasyonu section */}
        {/* {(tableDetail.reservation.depositAmount || 0).toFixed(2)}
            ₺
        */}
        {/* Replace with: */}
        {/* {(tableDetail.reservation.depositAmount || 0).toFixed(2)}{currencySymbol} */}

        {/* === TEMA === */}
        {tab === "theme" && (
          <Card title="Masaüstü Tema">
            <p className="text-sm text-gray-600 mb-4">
              Restoran personelinin kullandığı masaüstü ekranın renk düzenini seçin.
              Seçiminiz sadece bu bilgisayarda geçerli olacaktır.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {THEME_OPTIONS.map((opt) => {
                const isActive = opt.key === selectedTheme;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSelectTheme(opt.key)}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      padding: 12,
                      border: isActive
                        ? "1px solid var(--rezvix-primary-strong)"
                        : "1px solid var(--rezvix-border-subtle)",
                      background: isActive
                        ? "radial-gradient(circle at top left, var(--rezvix-primary-soft), transparent 60%), rgba(0,0,0,0.55)"
                        : "rgba(0,0,0,0.45)",
                      boxShadow: isActive
                        ? "0 14px 32px rgba(0,0,0,0.7)"
                        : "0 8px 20px rgba(0,0,0,0.45)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--rezvix-text-soft)",
                        marginBottom: 8,
                      }}
                    >
                      {opt.description}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isActive
                          ? "var(--rezvix-accent)"
                          : "var(--rezvix-text-muted)",
                      }}
                    >
                      {isActive ? "Seçili tema" : "Temayı uygula"}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </RestaurantDesktopLayout>
  );
};