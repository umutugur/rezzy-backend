// utils/qr.js
import crypto from "crypto";
import QRCode from "qrcode";

// Her girdiyi 10 haneli UNIX saniyesine çevir
const toUnixSeconds = (ts) => {
  if (typeof ts === "number") return Math.floor(ts);
  if (typeof ts === "string" && /^\d{10,}$/.test(ts)) return Math.floor(Number(ts));
  const d = ts instanceof Date ? ts : new Date(ts);
  return Math.floor(d.getTime() / 1000);
};

// rid/mid/ts gövdesi (ts: unix sec)
function baseString({ rid, mid, ts }) {
  const sec = toUnixSeconds(ts);
  return `${rid}/${mid}/${sec}`;
}

/** payload: rid/mid/ts/sig  (sig = HMAC-SHA256 hex) */
export function signQR({ rid, mid, ts }) {
  const base = baseString({ rid, mid, ts });
  const sig = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET)
    .update(base)
    .digest("hex");
  return { base, sig, payload: `${base}/${sig}` };
}

/** QR görseli (Data URL). QR içine payload metni basılır. */
export async function generateQRDataURL({ rid, mid, ts }) {
  const { payload } = signQR({ rid, mid, ts });
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, scale: 6 });
}

/** opsiyonel doğrulama */
export function verifyQR({ rid, mid, ts, sig }) {
  const { sig: expected } = signQR({ rid, mid, ts });
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
