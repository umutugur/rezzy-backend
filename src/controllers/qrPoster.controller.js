// src/controllers/qrPoster.controller.js
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import JSZip from "jszip";
import axios from "axios";

import Restaurant from "../models/Restaurant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dikkat: senin projede klasör adı "assests"
const POSTER_TEMPLATE_PATH = path.join(__dirname, "../assets/qr-poster-a5.png");
const APP_LINK_ICON_PATH   = path.join(__dirname, "../assets/qr-app-link.png");
const FONT_PATH = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");
// ---------------- Yardımcılar ----------------

function buildTableQrUrl(restaurantId, tableKey) {
  // Bunu kendi gerçek deep-link / QR URL'ine göre düzenleyebilirsin
  return `${restaurantId}|${tableKey}`;
}

function safeFileName(str) {
  return String(str || "")
    .normalize("NFKD")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "poster";
}

async function fetchLogoBuffer(restaurant) {
  const url = restaurant?.logoUrl || restaurant?.logo || null;
  if (!url) return null;

  try {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("Logo yüklenemedi:", e?.message);
    return null;
  }
}

/**
 * Verilen restoran + masa için tek bir PDF poster üretir.
 * Geriye { filename, buffer } döner.
 */
async function generatePosterPdf(restaurant, table) {
  const [posterBytes, appLinkBytes, logoBytes, fontBytes] = await Promise.all([
    fs.readFile(POSTER_TEMPLATE_PATH),
    fs.readFile(APP_LINK_ICON_PATH),
    fetchLogoBuffer(restaurant),
    fs.readFile(FONT_PATH),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage();
  const posterImage = await pdfDoc.embedPng(posterBytes);

  // Sayfa boyutunu görselle aynı yap
  const bgWidth = posterImage.width;
  const bgHeight = posterImage.height;
  page.setSize(bgWidth, bgHeight);

  // Tasarım sabitleri ve ölçek faktörleri
  const DESIGN_WIDTH = 832;
  const DESIGN_HEIGHT = 1248;
  const scaleX = bgWidth / DESIGN_WIDTH;
  const scaleY = bgHeight / DESIGN_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  // Arka plan görseli tam sayfa
  page.drawImage(posterImage, {
    x: 0,
    y: 0,
    width: bgWidth,
    height: bgHeight,
  });

  const font = await pdfDoc.embedFont(fontBytes);
  const fontLight = font; // aynı fontu hafif metinlerde de kullanıyoruz

  // ---------- QR alanı (ortadaki büyük kutu) ----------
  // Tasarımda büyük beyaz kutunun koordinatları (px)
  const qrContainerDesign = {
    left: 120,
    right: 709,
    bottom: 260,
    top: 696,
  };

  // Kutunun içinde bırakmak istediğimiz boşluk (px)
  const qrMarginX = 80;
  const qrMarginY = 80;

  const qrAvailWidthDesign =
    qrContainerDesign.right - qrContainerDesign.left - 2 * qrMarginX;
  const qrAvailHeightDesign =
    qrContainerDesign.top - qrContainerDesign.bottom - 2 * qrMarginY;

  const qrSizeDesign = Math.min(qrAvailWidthDesign, qrAvailHeightDesign);
  const qrSize = qrSizeDesign * scale;

  const qrCenterXDesign =
    (qrContainerDesign.left + qrContainerDesign.right) / 2;
  const qrCenterYDesign =
    (qrContainerDesign.bottom + qrContainerDesign.top) / 2;

  const qrCenterX = qrCenterXDesign * scaleX;
  const qrCenterY = qrCenterYDesign * scaleY;

  const qrX = qrCenterX - qrSize / 2;
  const qrY = qrCenterY - qrSize / 2;

  const qrUrl = buildTableQrUrl(restaurant._id, table._id || table.name);
  const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
    margin: 1,
    width: Math.round(qrSize),
  });

  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // ---------- QR içinde logo ----------
  if (logoBytes) {
    try {
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoSize = qrSize * 0.28; // QR'in yaklaşık %30'u kadar
      const logoX = qrCenterX - logoSize / 2;
      const logoY = qrCenterY - logoSize / 2;

      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoSize,
        height: logoSize,
      });
    } catch (e) {
      console.error("QR içine logo gömülemedi:", e?.message);
    }
  }

  // ---------- Restoran adı (QR altındaki 1. beyaz bar) ----------
  const restaurantName = restaurant.name || "Restoran";
  const restaurantTextSize = 26;

  // Tasarım koordinatları: 1. bar (y: 360..479, x: 231..602)
  const firstBarCenterYDesign = (360 + 479) / 2; // ~419.5
  const firstBarCenterY = firstBarCenterYDesign * scaleY;

  const restTextWidth = font.widthOfTextAtSize(
    restaurantName,
    restaurantTextSize
  );

  page.drawText(restaurantName, {
    x: bgWidth / 2 - restTextWidth / 2,
    y: firstBarCenterY - restaurantTextSize / 2,
    size: restaurantTextSize,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });

  // ---------- Masa adı (QR altındaki 2. beyaz bar) ----------
  const tableName = table.name || "Masa";
  const tableTextSize = 22;

  // Tasarım koordinatları: 2. bar (y: 300..359, x: 189..669)
  const secondBarCenterYDesign = (300 + 359) / 2; // ~329.5
  const secondBarCenterY = secondBarCenterYDesign * scaleY;

  const tableTextWidth = fontLight.widthOfTextAtSize(
    tableName,
    tableTextSize
  );

  page.drawText(tableName, {
    x: bgWidth / 2 - tableTextWidth / 2,
    y: secondBarCenterY - tableTextSize / 2,
    size: tableTextSize,
    font: fontLight,
    color: rgb(0.2, 0.2, 0.2),
  });

  // ---------- En alttaki kutuya app-link QR ikonu ----------
  const appIcon = await pdfDoc.embedPng(appLinkBytes);

  // Tasarım koordinatları: alt kare (y: 40..199, x: 280..559)
  const bottomSquare = { bottom: 40, top: 199, left: 280, right: 559 };
  const bottomCenterXDesign = (bottomSquare.left + bottomSquare.right) / 2;
  const bottomCenterYDesign = (bottomSquare.bottom + bottomSquare.top) / 2;

  const bottomCenterX = bottomCenterXDesign * scaleX;
  const bottomCenterY = bottomCenterYDesign * scaleY;

  const appSizeDesign = 110;
  const appSize = appSizeDesign * scale;

  const appX = bottomCenterX - appSize / 2;
  const appY = bottomCenterY - appSize / 2;

  page.drawImage(appIcon, {
    x: appX,
    y: appY,
    width: appSize,
    height: appSize,
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `Rezvix-QR-Poster-${safeFileName(restaurant.name)}-${safeFileName(
    table.name
  )}.pdf`;

  return { filename, buffer: Buffer.from(pdfBytes) };
}

// ---------------- Controller Fonksiyonları ----------------

export async function getTablePoster(req, res) {
  try {
    const { restaurantId, tableKey } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ message: "Restoran bulunamadı" });
    }

    const tables = Array.isArray(restaurant.tables) ? restaurant.tables : [];
    const table =
      tables.find((t) => String(t._id) === String(tableKey)) ||
      tables.find((t) => t.name === tableKey);

    if (!table) {
      return res.status(404).json({ message: "Masa bulunamadı" });
    }

    const { filename, buffer } = await generatePosterPdf(restaurant, table);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.send(buffer);
  } catch (e) {
    console.error("getTablePoster error:", e);
    return res
      .status(500)
      .json({ message: "Poster oluşturulurken hata oluştu." });
  }
}

export async function getAllTablePostersZip(req, res) {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ message: "Restoran bulunamadı" });
    }

    const tables = (restaurant.tables || []).filter((t) => t.isActive !== false);
    if (!tables.length) {
      return res.status(400).json({ message: "Aktif masa bulunamadı" });
    }

    const zip = new JSZip();

    for (const table of tables) {
      const { filename, buffer } = await generatePosterPdf(restaurant, table);
      zip.file(filename, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const zipName = `Rezvix-Table-Posters-${safeFileName(restaurant.name)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipName}"`
    );
    return res.send(zipBuffer);
  } catch (e) {
    console.error("getAllTablePostersZip error:", e);
    return res
      .status(500)
      .json({ message: "ZIP paketi oluşturulurken hata oluştu." });
  }
}