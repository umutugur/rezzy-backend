// src/utils/qrPoster.js
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const sharp = require("sharp");
const axios = require("axios");

const POSTER_BG = path.resolve(__dirname, "../assests/qr-poster-a5.png");
const APP_LINK_QR = path.resolve(__dirname, "../assests/qr-app-link.png");

// Logo gömülü QR oluşturma
async function generateQR(qrUrl, logoUrl) {
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 0,
    width: 900,
  });

  if (!logoUrl) return qrBuffer;

  try {
    const logoData = await axios.get(logoUrl, { responseType: "arraybuffer" });
    const logoBuffer = Buffer.from(logoData.data);

    const qrImg = sharp(qrBuffer);
    const meta = await qrImg.metadata();
    const size = meta.width;
    const logoSize = Math.floor(size * 0.28);

    const logoProcessed = await sharp(logoBuffer)
      .resize(logoSize, logoSize)
      .png()
      .toBuffer();

    return await qrImg
      .composite([{ input: logoProcessed, top: size / 2 - logoSize / 2, left: size / 2 - logoSize / 2 }])
      .png()
      .toBuffer();
  } catch {
    return qrBuffer;
  }
}

async function createQrPoster({ restaurantName, tableName, qrUrl, logoUrl }) {
  const qrWithLogo = await generateQR(qrUrl, logoUrl);

  const PAGE_W = 832;
  const PAGE_H = 1248;
  const QR_SIZE = 450;
  const QR_X = (PAGE_W - QR_SIZE) / 2;
  const QR_Y = 260;

  const NAME_Y = 760;
  const TABLE_Y = 830;

  const APP_SIZE = 160;
  const APP_X = (PAGE_W - APP_SIZE) / 2;
  const APP_Y = 990;

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });

    const chunks = [];
    doc.on("data", (d) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.image(POSTER_BG, 0, 0, { width: PAGE_W, height: PAGE_H });

    doc.image(qrWithLogo, QR_X, QR_Y, { width: QR_SIZE });

    doc.font("Helvetica-Bold").fontSize(24).fillColor("#222")
      .text(restaurantName, (PAGE_W - 600) / 2, NAME_Y, { width: 600, align: "center" });

    doc.font("Helvetica").fontSize(20).fillColor("#333")
      .text(tableName, (PAGE_W - 600) / 2, TABLE_Y, { width: 600, align: "center" });

    doc.image(APP_LINK_QR, APP_X, APP_Y, { width: APP_SIZE });

    doc.end();
  });
}

module.exports = { createQrPoster };