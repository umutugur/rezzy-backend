// utils/qr.js
import crypto from "crypto";
import QRCode from "qrcode";

/** rid/mid/ts gövdesi */
function baseString({ rid, mid, ts }) {
  return `${rid}/${mid}/${ts}`;
}

/**
 * HMAC-SHA256 (hex) imzayı üretir ve payload'u döner.
 * payload formatı: "rid/mid/ts/sig"
 */
export function signQR({ rid, mid, ts }) {
  const base = baseString({ rid, mid, ts });
  const sig = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET)
    .update(base)
    .digest("hex");
  return { base, sig, payload: `${base}/${sig}` };
}

/** QR görselini (Data URL) üretir; QR'nin içine payload (metin) basılır */
export async function generateQRDataURL({ rid, mid, ts }) {
  const { payload } = signQR({ rid, mid, ts });
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
}

/** Doğrulama (opsiyonel kullanılabilir) */
export function verifyQR({ rid, mid, ts, sig }) {
  const { sig: expected } = signQR({ rid, mid, ts });
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
