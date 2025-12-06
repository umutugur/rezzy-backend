// src/controllers/qrPoster.controller.js
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
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
  return `https://rezvix.app/qr/${restaurantId}/${encodeURIComponent(
    String(tableKey)
  )}`;
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
  const page = pdfDoc.addPage();
  const posterImage = await pdfDoc.embedPng(posterBytes);

  // Sayfa boyutunu görselle aynı yap
  const bgWidth = posterImage.width;
  const bgHeight = posterImage.height;
  page.setSize(bgWidth, bgHeight);

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
  // Bu koordinatlar, senin verdiğin 832x1248 posterden otomatik olarak çıkardığım değerler
  const qrBox = {
    x: 217,
    y: bgHeight - 711, // pdf-lib'te (0,0) sol-alt olduğu için ters çeviriyoruz
    size: 400, // 617-217 = 400
  };

  const qrUrl = buildTableQrUrl(restaurant._id, table._id || table.name);
  const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
    margin: 1,
    width: qrBox.size,
  });

  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  // QR kodu kare kutunun içine oturt
  page.drawImage(qrImage, {
    x: qrBox.x,
    y: qrBox.y,
    width: qrBox.size,
    height: qrBox.size,
  });

  // ---------- QR içinde logo ----------
  if (logoBytes) {
    try {
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoSize = qrBox.size * 0.28; // QR'in yaklaşık %30'u kadar
      const logoX = qrBox.x + qrBox.size / 2 - logoSize / 2;
      const logoY = qrBox.y + qrBox.size / 2 - logoSize / 2;

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
  const restaurantTextSize = 20;
  const restaurantY = bgHeight - 700; // yaklaşık 1. beyaz bar merkezi

  const restTextWidth = font.widthOfTextAtSize(restaurantName, restaurantTextSize);
  page.drawText(restaurantName, {
    x: bgWidth / 2 - restTextWidth / 2,
    y: restaurantY,
    size: restaurantTextSize,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });

  // ---------- Masa adı (QR altındaki 2. beyaz bar) ----------
  const tableName = table.name || "Masa";
  const tableTextSize = 18;
  const tableY = bgHeight - 760; // yaklaşık 2. beyaz bar merkezi

  const tableTextWidth = fontLight.widthOfTextAtSize(tableName, tableTextSize);
  page.drawText(tableName, {
    x: bgWidth / 2 - tableTextWidth / 2,
    y: tableY,
    size: tableTextSize,
    font: fontLight,
    color: rgb(0.2, 0.2, 0.2),
  });

  // ---------- En alttaki kutuya app-link QR ikonu ----------
  const appIcon = await pdfDoc.embedPng(appLinkBytes);
  const appSize = 140; // alttaki kare kutuya uygun
  const appX = bgWidth / 2 - appSize / 2;
  const appY = 60; // sayfanın en altından biraz yukarı

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