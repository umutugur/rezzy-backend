// controllers/stripe.webhook.controller.js
import Stripe from "stripe";
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Order from "../models/Order.js";
import OrderSession from "../models/OrderSession.js";

import DeliveryPaymentAttempt from "../models/DeliveryPaymentAttempt.js";
import DeliveryOrder from "../models/DeliveryOrder.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;

export const stripeWebhook = async (req, res) => {
  if (!stripe || !webhookSecret) {
    console.error("[StripeWebhook] Stripe not configured. Check STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("Stripe not configured");
  }

  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[StripeWebhook] constructEvent error:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const metadata = pi.metadata || {};
        const kind = String(metadata.kind || "");

        if (kind === "delivery_attempt") {
          const piId = pi.id;

          const attempt = await DeliveryPaymentAttempt.findOne({ stripePaymentIntentId: piId });
          if (!attempt) {
            console.warn("[StripeWebhook] delivery_attempt succeeded but attempt not found:", piId);
            break;
          }

          if (attempt.status === "succeeded" && attempt.deliveryOrderId) break;

          const amountMinor = typeof pi.amount === "number" ? pi.amount : 0;
          const paidAmount = amountMinor / 100;
          const attemptTotal = Number(attempt.total || 0);
          if (Math.abs(paidAmount - attemptTotal) > 0.01) {
            console.warn("[StripeWebhook] delivery_attempt amount mismatch:", {
              paidAmount,
              attemptTotal,
              piId,
              attemptId: String(attempt._id),
            });
          }

          attempt.status = "succeeded";

          if (!attempt.deliveryOrderId) {
            const commissionRate = 0;
            const commissionAmount = 0;

            const order = await DeliveryOrder.create({
              restaurantId: attempt.restaurantId,
              userId: attempt.userId,
              addressId: attempt.addressId,

              // ✅ snapshotlar attempt’ten
              customerName: attempt.customerName || "",
              customerPhone: attempt.customerPhone || "",
              addressText: attempt.addressText || "",
              customerNote: attempt.customerNote || "",

              zoneId: attempt.zoneId,
              zoneIsActive: true,
              minOrderAmountSnapshot: attempt.minOrderAmountSnapshot,
              feeAmountSnapshot: attempt.feeAmountSnapshot,

              items: attempt.items,
              currency: attempt.currency,

              subtotal: attempt.subtotal,
              deliveryFee: attempt.deliveryFee,
              total: attempt.total,

              commissionRate,
              commissionAmount,

              paymentMethod: "card",
              paymentStatus: "paid",
              stripePaymentIntentId: piId,

              status: "accepted",
              acceptedAt: new Date(),
            });

            attempt.deliveryOrderId = order._id;
          }

          await attempt.save();
          break;
        }

        // ---- existing QR / reservation logic aynen kalsın ----
        const orderId = metadata.orderId;
        const sessionId = metadata.sessionId;

        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
          const currency = (pi.currency || "").toUpperCase();
          const amountMinor = typeof pi.amount === "number" ? pi.amount : 0;
          const amount = amountMinor / 100;

          const order = await Order.findByIdAndUpdate(
            orderId,
            {
              $set: {
                stripePaymentIntentId: pi.id,
                paymentStatus: "paid",
                currency,
                total: amount,
                status: "accepted",
              },
            },
            { new: true }
          );

          if (order && sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
            await OrderSession.updateOne(
              { _id: sessionId },
              {
                $inc: { "totals.cardTotal": amount, "totals.grandTotal": amount },
                $set: { lastOrderAt: new Date() },
              }
            );
          }

          break;
        }

        const reservationId = metadata.reservationId;

        if (reservationId && mongoose.Types.ObjectId.isValid(reservationId)) {
          const currency = (pi.currency || "").toUpperCase();
          const amountMinor = typeof pi.amount === "number" ? pi.amount : 0;
          const amount = amountMinor / 100;

          await Reservation.updateOne(
            { _id: reservationId },
            {
              $set: {
                paymentProvider: "stripe",
                paymentIntentId: pi.id,
                depositStatus: "paid",
                depositPaid: true,
                paidCurrency: currency,
                paidAmount: amount,
              },
            }
          );
        } else {
          console.warn("[StripeWebhook] payment_intent.succeeded without valid kind/reservationId/orderId");
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const metadata = pi.metadata || {};
        const kind = String(metadata.kind || "");

        if (kind === "delivery_attempt") {
          const piId = pi.id;

          const attempt = await DeliveryPaymentAttempt.findOne({ stripePaymentIntentId: piId });
          if (!attempt) {
            console.warn("[StripeWebhook] delivery_attempt failed but attempt not found:", piId);
            break;
          }

          if (attempt.status !== "pending") break;

          attempt.status = "failed";
          await attempt.save();
          break;
        }

        const orderId = metadata.orderId;
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
          await Order.updateOne(
            { _id: orderId },
            { $set: { stripePaymentIntentId: pi.id, paymentStatus: "failed" } }
          );
          break;
        }

        const reservationId = metadata.reservationId;
        if (reservationId && mongoose.Types.ObjectId.isValid(reservationId)) {
          await Reservation.updateOne(
            { _id: reservationId },
            {
              $set: {
                paymentProvider: "stripe",
                paymentIntentId: pi.id,
                depositStatus: "failed",
                depositPaid: false,
              },
            }
          );
        } else {
          console.warn("[StripeWebhook] payment_intent.payment_failed without valid kind/reservationId/orderId");
        }

        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[StripeWebhook] handler error:", err?.message || err);
    return res.status(500).send("Webhook handler error");
  }
};