import React from "react";
import Cropper from "react-easy-crop";
import { cropToFile } from "../../lib/cropImage";
import { uploadMarketImage } from "../../api/marketDesktop";

type Props = {
  label: string;
  hint?: string;
  aspect: number;
  outW: number;
  outH: number;
  shape: "circle" | "rect";
  value: string | null | undefined;
  onUploaded: (url: string) => void;
};

export default function ImageCropField({ label, hint, aspect, outW, outH, shape, value, onUploaded }: Props) {
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("image.jpg");
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [areaPixels, setAreaPixels] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => { setImageSrc(String(reader.result)); setOpen(true); setCrop({ x: 0, y: 0 }); setZoom(1); };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const confirm = async () => {
    if (!imageSrc || !areaPixels) return;
    setBusy(true);
    try {
      const file = await cropToFile(imageSrc, areaPixels, fileName, outW, outH);
      const { url } = await uploadMarketImage(file);
      onUploaded(url);
      setOpen(false);
      setImageSrc(null);
    } catch {
      alert("Görsel yüklenemedi");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>
        {label}{hint ? <span style={{ color: "#6b7280" }}> · {hint}</span> : null}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {value ? (
          <img src={value} alt={label}
            style={{ width: shape === "circle" ? 64 : 120, height: 64,
              borderRadius: shape === "circle" ? "50%" : 8, objectFit: "cover", border: "1px solid #2d3348" }} />
        ) : (
          <div style={{ width: shape === "circle" ? 64 : 120, height: 64,
            borderRadius: shape === "circle" ? "50%" : 8, background: "#2d3348" }} />
        )}
        <label style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, background: "#374151", color: "#fff", fontSize: 13 }}>
          {value ? "Değiştir" : "Görsel Seç"}
          <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        </label>
      </div>

      {open && imageSrc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1e2330", borderRadius: 16, padding: 20, width: 420, maxWidth: "90vw" }}>
            <div style={{ position: "relative", width: "100%", height: 300, background: "#000", borderRadius: 8, overflow: "hidden" }}>
              <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={aspect}
                cropShape={shape === "circle" ? "round" : "rect"} showGrid={shape === "rect"}
                onCropChange={setCrop} onZoomChange={setZoom}
                onCropComplete={(_, area) => setAreaPixels(area as { x: number; y: number; width: number; height: number })} />
            </div>
            <input type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} style={{ width: "100%", marginTop: 12 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={() => { setOpen(false); setImageSrc(null); }}
                style={{ padding: "8px 14px", borderRadius: 8, background: "#374151", color: "#fff", border: "none", cursor: "pointer" }}>İptal</button>
              <button onClick={confirm} disabled={busy}
                style={{ padding: "8px 14px", borderRadius: 8, background: busy ? "#6b7280" : "#4f46e5", color: "#fff", border: "none", cursor: busy ? "default" : "pointer" }}>
                {busy ? "Yükleniyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
