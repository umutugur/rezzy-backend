// rezzy-backend/src/controllers/review.controller.js
import mongoose from "mongoose";
import Review from "../models/Review.js";
import Restaurant from "../models/Restaurant.js";
import MarketStore from "../models/MarketStore.js";
import TaxiDriver from "../models/TaxiDriver.js";
import Order from "../models/Order.js";
import DeliveryOrder from "../models/DeliveryOrder.js";
import MarketOrder from "../models/MarketOrder.js";
import TaxiRide from "../models/TaxiRide.js";

const toObjectId = (id) => {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
};

async function entityExists(entityType, entityId) {
  switch (entityType) {
    case "restaurant":
    case "delivery":
      return !!(await Restaurant.exists({ _id: entityId }));
    case "market":
      return !!(await MarketStore.exists({ _id: entityId }));
    case "taxi_driver":
      return !!(await TaxiDriver.exists({ _id: entityId }));
    default:
      return false;
  }
}

async function checkEligibility(entityType, entityId, userId) {
  const uid = toObjectId(userId);
  const eid = toObjectId(entityId);

  switch (entityType) {
    case "restaurant": {
      const hasOrder = await Order.exists({ restaurantId: eid, userId: uid, paymentStatus: "paid" });
      if (hasOrder) return { eligible: true, orderId: null, orderModel: "Order" };
      const Reservation = (await import("../models/Reservation.js")).default;
      const hasReservation = await Reservation.exists({
        restaurantId: eid,
        userId: uid,
        status: { $in: ["confirmed", "arrived", "completed"] },
      });
      if (hasReservation) return { eligible: true, orderId: null, orderModel: "Order" };
      return { eligible: false };
    }
    case "delivery": {
      const order = await DeliveryOrder.findOne({ restaurantId: eid, userId: uid, status: "delivered" }).select("_id").lean();
      if (order) return { eligible: true, orderId: order._id, orderModel: "DeliveryOrder" };
      return { eligible: false };
    }
    case "market": {
      const order = await MarketOrder.findOne({ store: eid, customer: uid, status: "delivered" }).select("_id").lean();
      if (order) return { eligible: true, orderId: order._id, orderModel: "MarketOrder" };
      return { eligible: false };
    }
    case "taxi_driver": {
      const ride = await TaxiRide.findOne({ driver: eid, passenger: uid, status: "completed" }).select("_id").lean();
      if (ride) return { eligible: true, orderId: ride._id, orderModel: "TaxiRide" };
      return { eligible: false };
    }
    default:
      return { eligible: false };
  }
}

async function updateEntityRating(entityType, entityId) {
  const agg = await Review.aggregate([
    { $match: { entityType, entityId: toObjectId(entityId), status: "visible" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avg = agg[0]?.avg ?? 0;
  const count = agg[0]?.count ?? 0;
  const rounded = Math.round(avg * 10) / 10;

  switch (entityType) {
    case "restaurant":
    case "delivery":
      await Restaurant.updateOne({ _id: entityId }, { $set: { rating: rounded, ratingCount: count } });
      break;
    case "market":
      await MarketStore.updateOne({ _id: entityId }, { $set: { rating: rounded, ratingCount: count } });
      break;
    case "taxi_driver":
      await TaxiDriver.updateOne({ _id: entityId }, { $set: { rating: rounded, ratingCount: count } });
      break;
  }
}

export async function listReviews(req, res, next) {
  try {
    const { entityType, entityId } = req.params;
    const validTypes = ["restaurant", "market", "delivery", "taxi_driver"];
    if (!validTypes.includes(entityType)) return res.status(400).json({ message: "Geçersiz entityType" });
    if (!mongoose.Types.ObjectId.isValid(entityId)) return res.status(400).json({ message: "Geçersiz entityId" });

    const eid = toObjectId(entityId);
    const lim = Math.min(Number(req.query.limit) || 20, 50);
    const query = { entityType, entityId: eid, status: "visible" };
    if (req.query.cursor && mongoose.Types.ObjectId.isValid(req.query.cursor)) {
      query._id = { $lt: toObjectId(req.query.cursor) };
    }

    const reviews = await Review.find(query)
      .sort({ _id: -1 })
      .limit(lim + 1)
      .populate("userId", "name avatar")
      .lean();

    const hasMore = reviews.length > lim;
    const items = hasMore ? reviews.slice(0, lim) : reviews;
    const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

    const summaryAgg = await Review.aggregate([
      { $match: { entityType, entityId: eid, status: "visible" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalCount: { $sum: 1 },
          dist1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          dist2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          dist3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          dist4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          dist5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        },
      },
    ]);

    const s = summaryAgg[0];
    const summary = s
      ? {
          averageRating: Math.round((s.averageRating ?? 0) * 10) / 10,
          totalCount: s.totalCount,
          distribution: [1, 2, 3, 4, 5].map((star) => ({ star, count: s[`dist${star}`] ?? 0 })),
        }
      : { averageRating: 0, totalCount: 0, distribution: [] };

    let userReview = null;
    if (req.user) {
      userReview = await Review.findOne({ entityType, entityId: eid, userId: toObjectId(req.user.id) }).lean();
    }

    return res.json({ reviews: items, summary, nextCursor, userReview });
  } catch (e) { next(e); }
}

export async function submitReview(req, res, next) {
  try {
    const { entityType, entityId } = req.params;
    const { rating, comment = "" } = req.body;
    const userId = req.user?.id;

    const validTypes = ["restaurant", "market", "delivery", "taxi_driver"];
    if (!validTypes.includes(entityType)) return res.status(400).json({ message: "Geçersiz entityType" });
    if (!mongoose.Types.ObjectId.isValid(entityId)) return res.status(400).json({ message: "Geçersiz entityId" });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: "rating 1-5 arasında olmalı" });

    const exists = await entityExists(entityType, entityId);
    if (!exists) return res.status(404).json({ message: "İlgili yer bulunamadı" });

    const eligibility = await checkEligibility(entityType, entityId, userId);
    if (!eligibility.eligible) {
      return res.status(403).json({
        message: "Bu yeri değerlendirmek için önce sipariş vermiş veya ziyaret etmiş olmanız gerekiyor.",
        code: "NOT_ELIGIBLE",
      });
    }

    const existing = await Review.findOne({
      entityType,
      entityId: toObjectId(entityId),
      userId: toObjectId(userId),
    });

    let review;
    if (existing) {
      existing.rating = rating;
      existing.comment = String(comment).trim();
      existing.verifiedPurchase = true;
      review = await existing.save();
    } else {
      review = await Review.create({
        entityType,
        entityId: toObjectId(entityId),
        userId: toObjectId(userId),
        rating,
        comment: String(comment).trim(),
        verifiedPurchase: true,
        orderId: eligibility.orderId,
        orderModel: eligibility.orderModel,
      });
    }

    updateEntityRating(entityType, entityId).catch((e) =>
      console.error("[review] updateEntityRating error", e)
    );

    return res.status(201).json(review);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Bu yer için zaten bir yorumunuz var." });
    next(e);
  }
}
