import crypto from "crypto";
import QRCode from "qrcode";

/** İmza tabanı: rid/mid/ts */
function baseString({ rid, mid, ts }) {
  return `${rid}/${mid}/${ts}`;
}

/**
 * HMAC-SHA256 ile imza (hex) üretir ve payload metnini verir:
 * payload = "rid/mid/ts/sig"
 */
export function signQR({ rid, mid, ts }) {
  const base = baseString({ rid, mid, ts });
  const sig = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET)
    .update(base)
    .digest("hex"); // mobil taraf hex bekliyor

  return { base, sig, payload: `${base}/${sig}` };
}

/** QR görseli (Data URL) üretir; QR içine payload metni basılır */
export async function generateQRDataURL({ rid, mid, ts }) {
  const { payload } = signQR({ rid, mid, ts });
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
}

/** Gelen sig'i tekrar hesaplayıp sabit zaman karşılaştırır */
export function verifyQR({ rid, mid, ts, sig }) {
  const { sig: expected } = signQR({ rid, mid, ts });
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
