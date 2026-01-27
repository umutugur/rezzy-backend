// controllers/tableService.controller.js
import mongoose from "mongoose";
import TableServiceRequest from "../models/TableServiceRequest.js";
import Restaurant from "../models/Restaurant.js";
import { notifyRestaurantOwner } from "../services/notification.service.js";

/** Masa durumunu belirleyen yardımcı */
function statusFromType(type) {
  if (type === "waiter") return "waiter_call";
  if (type === "bill") return "bill_request";
  return "order_active";
}

/** Tek masayı güncelleme helper */
async function updateTableStatus(restaurantId, tableId, patch) {
  if (!restaurantId || !tableId) return;

  try {
    await Restaurant.updateOne(
      { _id: restaurantId, "tables._id": tableId },
      {
        $set: Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [`tables.$.${k}`, v])
        ),
      }
    );
  } catch (err) {
    console.error("[tableService.updateTableStatus] err", err);
  }
}

export async function createRequest(req, res) {
  try {
    const { restaurantId, tableId, sessionId, type } = req.body || {};
    if (!restaurantId || !type) {
      return res.status(400).json({ message: "restaurantId ve type zorunlu." });
    }

    const doc = await TableServiceRequest.create({
      restaurantId,
      tableId: tableId || null,
      sessionId: sessionId || null,
      type,
    });

    // 🆕 MASA DURUMUNU ANINDA GÜNCELLE
    if (tableId) {
      const status = statusFromType(type);
      await updateTableStatus(restaurantId, tableId, { status });
    }

    try {
      const typeLabel =
        type === "waiter"
          ? "Garson çağrısı"
          : type === "bill"
          ? "Hesap isteği"
          : "Masa servisi";
      const title = tableId ? `Masa ${tableId}` : "Masa servisi";
      const body = `${typeLabel} alındı.`;

      await notifyRestaurantOwner(restaurantId, {
        title,
        body,
        data: {
          type: "table_service_request",
          requestId: String(doc._id),
          restaurantId,
          tableId: tableId || null,
          sessionId: sessionId || null,
          requestType: type,
        },
        key: `table-service:${doc._id}`,
        type: "table_service_request",
      });
    } catch (err) {
      console.warn("[tableService.createRequest] notifyRestaurantOwner warn:", err);
    }
    return res.json(doc);
  } catch (e) {
    console.error("[tableService.createRequest] err", e);
    return res.status(500).json({ message: "İstek oluşturulamadı." });
  }
}

/** Panel için */
export async function listRequests(req, res) {
  try {
    const { restaurantId } = req.query || {};

    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: "restaurantId geçersiz." });
    }

    const list = await TableServiceRequest
      .find({ restaurantId, status: "open" })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(list);
  } catch (err) {
    console.error("[tableService.listRequests] err", err);
    return res.status(500).json({ message: "Liste alınamadı." });
  }
}

/** Panelden garson isteği/hgsap isteği kapatma */
export async function handleRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Geçersiz id." });
    }

    const doc = await TableServiceRequest.findByIdAndUpdate(
      id,
      { $set: { status: "handled" } },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "İstek bulunamadı." });

    // MASAYI SIFIRLAMA (aktif session varsa order_active)
    if (doc.tableId && doc.restaurantId) {
      const openReq = await TableServiceRequest.exists({
        _id: { $ne: doc._id },
        restaurantId: doc.restaurantId,
        tableId: doc.tableId,
        status: "open",
      });

      if (!openReq) {
        await updateTableStatus(doc.restaurantId, doc.tableId, {
          status: "order_active",
        });
      }
    }

    return res.json(doc);
  } catch (err) {
    console.error("[tableService.handleRequest] err", err);
    return res.status(500).json({ message: "İstek kapatılamadı." });
  }
}
