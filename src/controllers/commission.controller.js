// src/controllers/commission.controller.js
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";
import ExcelJS from "exceljs";

/** Ay stringini (YYYY-MM) Date aralığına çevirir */
function monthRange(monthStr) {
  // monthStr yoksa: içinde bulunduğumuz ay
  const [y, m] = (monthStr || "").match(/^(\d{4})-(\d{2})$/)?.slice(1).map(Number)
    || [new Date().getUTCFullYear(), new Date().getUTCMonth() + 1];
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to   = new Date(Date.UTC(y, m    , 0, 23, 59, 59, 999)); // ilgili ayın son günü
  const label = `${String(y)}-${String(m).padStart(2,"0")}`;
  return { from, to, label };
}

/** Arrived rezervasyonlar için restoran bazlı özet (JSON) */
export const commissionsPreview = async (req, res, next) => {
  try {
    const { from, to, label } = monthRange(req.query.month);
    // sadece ARRIVED
    const match = { status: "arrived", dateTimeUTC: { $gte: from, $lte: to } };

    const rows = await Reservation.aggregate([
      { $match: match },
      { $group: {
          _id: "$restaurantId",
          arrivedCount: { $sum: 1 },
          revenueArrived: { $sum: { $ifNull: ["$totalPrice", 0] } },
        }
      },
      { $lookup: {
          from: "restaurants",
          localField: "_id",
          foreignField: "_id",
          as: "rest"
      }},
      { $addFields: {
          restaurantName: { $ifNull: [ { $arrayElemAt: ["$rest.name", 0] }, "(Restoran)"] },
          commissionRate: { $ifNull: [ { $arrayElemAt: ["$rest.commissionRate", 0] }, 0 ] },
          ownerId:        { $ifNull: [ { $arrayElemAt: ["$rest.owner", 0] }, null ] },
      }},
      { $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "_id",
          as: "owner"
      }},
      { $addFields: {
          ownerName:  { $ifNull: [ { $arrayElemAt: ["$owner.name", 0] }, null ] },
          ownerEmail: { $ifNull: [ { $arrayElemAt: ["$owner.email", 0] }, null ] },
      }},
      { $project: {
          _id: 1,
          restaurantName: 1,
          commissionRate: 1,
          arrivedCount: 1,
          revenueArrived: 1,
          ownerName: 1,
          ownerEmail: 1,
          commissionAmount: { $multiply: ["$revenueArrived", "$commissionRate"] },
      }},
      { $sort: { restaurantName: 1 } }
    ]);

    res.json({ ok: true, month: label, restaurants: rows });
  } catch (e) { next(e); }
};

/** Excel üretir ve indirir (Content-Disposition: attachment) */
export const commissionsExport = async (req, res, next) => {
  try {
    const { from, to, label } = monthRange(req.query.month);

    // Detay + özet verileri çek
    const match = { status: "arrived", dateTimeUTC: { $gte: from, $lte: to } };

    const reservations = await Reservation.find(match)
      .populate({ path: "restaurantId", select: "name commissionRate owner" })
      .populate({ path: "userId", select: "name email" })
      .sort({ restaurantId: 1, dateTimeUTC: 1 })
      .lean();

    // Map: restId -> { name, rate, owner, rows[], totals }
    const byRest = new Map();
    for (const r of reservations) {
      const restId = String(r.restaurantId?._id || r.restaurantId);
      if (!byRest.has(restId)) {
        byRest.set(restId, {
          restaurantId: restId,
          restaurantName: r.restaurantId?.name || "(Restoran)",
          commissionRate: Number(r.restaurantId?.commissionRate || 0),
          ownerId: r.restaurantId?.owner || null,
          rows: [],
          arrivedCount: 0,
          revenueArrived: 0,
        });
      }
      const bucket = byRest.get(restId);
      bucket.rows.push(r);
      bucket.arrivedCount += 1;
      bucket.revenueArrived += Number(r.totalPrice || 0);
    }

    // Sahip bilgilerini topla
    const ownerIds = [...new Set([...byRest.values()].map(x => String(x.ownerId)).filter(Boolean))]
      .map(id => new mongoose.Types.ObjectId(id));
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } }).select("name email").lean()
      : [];
    const ownersMap = new Map(owners.map(o => [String(o._id), o]));

    // Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rezzy";
    wb.created = new Date();

    // 1) Özet sayfası
    const wsSum = wb.addWorksheet(`Ozet ${label}`);
    wsSum.columns = [
      { header: "Restaurant", key: "restaurantName", width: 30 },
      { header: "Restaurant ID", key: "restaurantId", width: 26 },
      { header: "Sahip", key: "ownerName", width: 20 },
      { header: "Sahip E-posta", key: "ownerEmail", width: 28 },
      { header: "Arrived Rezervasyon", key: "arrivedCount", width: 18 },
      { header: "Arrived Toplam (₺)", key: "revenueArrived", width: 18 },
      { header: "Komisyon Oranı", key: "commissionRate", width: 16 },
      { header: "Komisyon Tutarı (₺)", key: "commissionAmount", width: 20 },
    ];

    let grandArrived = 0;
    let grandRevenue = 0;
    let grandCommission = 0;

    for (const v of byRest.values()) {
      const owner = v.ownerId ? ownersMap.get(String(v.ownerId)) : null;
      const commissionAmount = Math.round(v.revenueArrived * v.commissionRate);
      grandArrived += v.arrivedCount;
      grandRevenue += v.revenueArrived;
      grandCommission += commissionAmount;

      wsSum.addRow({
        restaurantName: v.restaurantName,
        restaurantId: v.restaurantId,
        ownerName: owner?.name || "",
        ownerEmail: owner?.email || "",
        arrivedCount: v.arrivedCount,
        revenueArrived: v.revenueArrived,
        commissionRate: v.commissionRate,
        commissionAmount,
      });
    }

    wsSum.addRow({});
    wsSum.addRow({
      restaurantName: "GENEL TOPLAM",
      arrivedCount: grandArrived,
      revenueArrived: grandRevenue,
      commissionAmount: grandCommission,
    }).font = { bold: true };

    // 2) Detay sayfası
    const wsDet = wb.addWorksheet(`Detay ${label}`);
    wsDet.columns = [
      { header: "Restaurant", key: "restaurantName", width: 30 },
      { header: "Rezervasyon ID", key: "rid", width: 26 },
      { header: "Tarih", key: "date", width: 20 },
      { header: "Kişi", key: "party", width: 10 },
      { header: "Tutar (₺)", key: "price", width: 14 },
      { header: "Komisyon Oranı", key: "rate", width: 16 },
      { header: "Komisyon (₺)", key: "comm", width: 16 },
      { header: "Müşteri", key: "customer", width: 24 },
      { header: "E-posta", key: "email", width: 28 },
    ];

    for (const v of byRest.values()) {
      for (const r of v.rows) {
        const commission = Math.round(Number(r.totalPrice || 0) * v.commissionRate);
        wsDet.addRow({
          restaurantName: v.restaurantName,
          rid: String(r._id),
          date: new Date(r.dateTimeUTC).toISOString().replace("T", " ").slice(0, 16),
          party: r.partySize,
          price: Number(r.totalPrice || 0),
          rate: v.commissionRate,
          comm: commission,
          customer: r.userId?.name || "",
          email: r.userId?.email || "",
        });
      }
    }

    // Response
    const filename = `rezzy-komisyon-${label}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
};