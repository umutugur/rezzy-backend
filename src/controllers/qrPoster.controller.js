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

  const font = await pdfDoc.embedFont(fontBytes);
  const fontLight = font; // şimdilik aynı fontu kullanıyoruz

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

  // Canva tasarımı A5: 14.8cm x 21cm
  const CANVA_WIDTH_CM = 14.8;
  const CANVA_HEIGHT_CM = 21;

  // cm -> px çevirimi (X ve Y ayrı)
  const pxPerCmX = bgWidth / CANVA_WIDTH_CM;
  const pxPerCmY = bgHeight / CANVA_HEIGHT_CM;

  // Üstten ölçülen cm değerini, PDF koordinatlarında (alt referanslı) merkeze çeviren helper
  const centerYFromTopCm = (centerFromTopCm) => {
    const centerFromBottomCm = CANVA_HEIGHT_CM - centerFromTopCm;
    return centerFromBottomCm * pxPerCmY;
  };

  // ---------- QR alanı (ortadaki büyük kutu) ----------
  // Kullanıcının Canva ölçüleri (cm):
  // büyük QR alanı: left 4.7, right 10.1, top 5.9, bottom 11.3
  const qrLeftCm = 4.7;
  const qrRightCm = 10.1;
  const qrTopCm = 5.9;
  const qrBottomCm = 11.3;

  const qrCenterXCm = (qrLeftCm + qrRightCm) / 2; // 7.4
  const qrCenterYFromTopCm = (qrTopCm + qrBottomCm) / 2; // 8.6

  const qrAreaWidthPx = (qrRightCm - qrLeftCm) * pxPerCmX;
  const qrAreaHeightPx = (qrBottomCm - qrTopCm) * pxPerCmY;

  // QR, alanın biraz içinde dursun diye %90 oranında kullanıyoruz
  const qrSize = Math.min(qrAreaWidthPx, qrAreaHeightPx) * 1.0;

  const qrCenterX = qrCenterXCm * pxPerCmX;
  const qrCenterY = centerYFromTopCm(qrCenterYFromTopCm);

  const qrX = qrCenterX - qrSize / 2;
  const qrY = qrCenterY - qrSize / 2;

  const qrUrl = buildTableQrUrl(restaurant._id, table._id || table.name);
  const qrPngBuffer = await QRCode.toBuffer(qrUrl, {
    margin: 1,
    width: Math.round(qrSize),
    errorCorrectionLevel:"H",
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
      let logoImage;

      // Önce PNG olarak dene, hata alırsak JPG olarak tekrar dene
      try {
        logoImage = await pdfDoc.embedPng(logoBytes);
      } catch (pngErr) {
        try {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        } catch (jpgErr) {
          console.error("Logo hem PNG hem JPG olarak gömülemedi:", jpgErr?.message || pngErr?.message);
          logoImage = null;
        }
      }

      if (logoImage) {
        // Logo boyutu (QR karesinin ortasında)
        const logoSize = qrSize * 0.28; // QR'in yaklaşık %30'u kadar
        const logoX = qrCenterX - logoSize / 2;
        const logoY = qrCenterY - logoSize / 2;

        // 🔲 QR orta alanında beyaz bir patch çiz (şeffaf PNG'lerde arka plan kaybolmasın)
        const bgPadding = logoSize * 0.30; // logodan biraz daha büyük beyaz kare
        const bgSize = logoSize + bgPadding;
        const bgX = qrCenterX - bgSize / 2;
        const bgY = qrCenterY - bgSize / 2;

        page.drawRectangle({
          x: bgX,
          y: bgY,
          width: bgSize,
          height: bgSize,
          color: rgb(1, 1, 1), // tam beyaz
        });

        // Logo'yu beyaz patch'in ortasına çiz
        page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoSize,
          height: logoSize,
        });
      }
    } catch (e) {
      console.error("QR içine logo gömülemedi:", e?.message);
    }
  }

  // ---------- Restoran adı (QR altındaki 1. beyaz bar) ----------
  const restaurantName = restaurant.name || "Restoran";

  // Canva: restoran adı barı -> left 4.5, right 10.3, top 12.6, bottom 13.8
  const nameBarLeftCm = 4.5;
  const nameBarRightCm = 10.3;
  const nameBarCenterFromTopCm = (12.6 + 13.8) / 2; // 13.2 cm

  const nameBarWidthPx = (nameBarRightCm - nameBarLeftCm) * pxPerCmX;
  const nameCenterY = centerYFromTopCm(nameBarCenterFromTopCm);

  // Temel font boyutu ve maksimum genişlik (biraz iç boşluk bırakarak)
  const baseRestaurantTextSize = 32;
  const nameMaxWidthPx = nameBarWidthPx * 0.9;

  // Metnin temel boyuttaki genişliği
  const baseNameWidth = font.widthOfTextAtSize(
    restaurantName,
    baseRestaurantTextSize
  );

  // Genişliği kutuya sığacak şekilde ölçekle
  let restaurantTextSize = baseRestaurantTextSize;
  if (baseNameWidth > nameMaxWidthPx) {
    const scale = nameMaxWidthPx / baseNameWidth;
    restaurantTextSize = baseRestaurantTextSize * scale;
    // Çok aşırı küçülmeyi engellemek için alt sınır
    if (restaurantTextSize < 14) {
      restaurantTextSize = 14;
    }
  }

  const restTextWidth = font.widthOfTextAtSize(
    restaurantName,
    restaurantTextSize
  );

  page.drawText(restaurantName, {
    x: bgWidth / 2 - restTextWidth / 2,
    y: nameCenterY - restaurantTextSize / 2,
    size: restaurantTextSize,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });

  // ---------- Masa adı (QR altındaki 2. beyaz bar) ----------
  const tableName = table.name || "Masa";

  // Canva: masa adı barı -> left 4.5, right 10.3, top 14.3, bottom 15.4
  const tableBarLeftCm = 4.5;
  const tableBarRightCm = 10.3;
  const tableBarCenterFromTopCm = (14.3 + 15.4) / 2; // 14.85 cm

  const tableBarWidthPx = (tableBarRightCm - tableBarLeftCm) * pxPerCmX;
  const tableCenterY = centerYFromTopCm(tableBarCenterFromTopCm);

  const baseTableTextSize = 30;
  const tableMaxWidthPx = tableBarWidthPx * 0.9;

  const baseTableWidth = fontLight.widthOfTextAtSize(
    tableName,
    baseTableTextSize
  );

  let tableTextSize = baseTableTextSize;
  if (baseTableWidth > tableMaxWidthPx) {
    const scale = tableMaxWidthPx / baseTableWidth;
    tableTextSize = baseTableTextSize * scale;
    if (tableTextSize < 14) {
      tableTextSize = 14;
    }
  }

  const tableTextWidth = fontLight.widthOfTextAtSize(
    tableName,
    tableTextSize
  );

  page.drawText(tableName, {
    x: bgWidth / 2 - tableTextWidth / 2,
    y: tableCenterY - tableTextSize / 2,
    size: tableTextSize,
    font: fontLight,
    color: rgb(0.2, 0.2, 0.2),
  });

  // ---------- En alttaki kutuya app-link QR ikonu ----------
  const appIcon = await pdfDoc.embedPng(appLinkBytes);

  // Canva: alt kare -> left 6.2, right 8.6, top 18.3, bottom 20.7
  const appLeftCm = 6.2;
  const appRightCm = 8.6;
  const appTopCm = 18.3;
  const appBottomCm = 20.7;

  const appCenterXCm = (appLeftCm + appRightCm) / 2; // 7.4
  const appCenterFromTopCm = (appTopCm + appBottomCm) / 2; // 19.5

  const appAreaWidthPx = (appRightCm - appLeftCm) * pxPerCmX;
  const appAreaHeightPx = (appBottomCm - appTopCm) * pxPerCmY;
  const appSize = Math.min(appAreaWidthPx, appAreaHeightPx) * 0.9;

  const appCenterX = appCenterXCm * pxPerCmX;
  const appCenterY = centerYFromTopCm(appCenterFromTopCm);

  const appX = appCenterX - appSize / 2;
  const appY = appCenterY - appSize / 2;

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