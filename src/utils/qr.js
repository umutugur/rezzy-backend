import crypto from "crypto";
import QRCode from "qrcode";

export function signQR({ rid, mid, ts }) {
  const payload = `${rid}.${mid}.${ts}`;
  const sig = crypto.createHmac("sha256", process.env.QR_HMAC_SECRET)
    .update(payload)
    .digest("hex");
  return { payload, sig };
}

export async function generateQRDataURL({ rid, mid, ts }) {
  const { sig } = signQR({ rid, mid, ts });
  const json = JSON.stringify({ rid, mid, ts, sig });
  return QRCode.toDataURL(json);
}

export function verifyQR({ rid, mid, ts, sig }) {
  const expected = signQR({ rid, mid, ts }).sig;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
