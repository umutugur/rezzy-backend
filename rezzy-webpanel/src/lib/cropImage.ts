function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Kırpılmış görseli verilen çıktı boyutunda JPEG File üretir. */
export async function cropToFile(
  imageSrc: string,
  cropPixels: { x: number; y: number; width: number; height: number },
  fileName: string,
  outW: number,
  outH: number,
): Promise<File> {
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context yok");
  canvas.width = outW;
  canvas.height = outH;

  const sx = clamp(cropPixels.x, 0, Math.max(0, image.naturalWidth - 1));
  const sy = clamp(cropPixels.y, 0, Math.max(0, image.naturalHeight - 1));
  const sw = clamp(cropPixels.width, 1, image.naturalWidth - sx);
  const sh = clamp(cropPixels.height, 1, image.naturalHeight - sy);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9);
  });
  const safe = fileName.replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${safe}-crop.jpg`, { type: "image/jpeg" });
}
