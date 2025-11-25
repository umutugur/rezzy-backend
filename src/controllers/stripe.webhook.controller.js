// controllers/stripe.webhook.controller.js
import Stripe from "stripe";
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Order from "../models/Order.js";
import OrderSession from "../models/OrderSession.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" })
  : null;

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

        // ✅ 1) QR ORDER ÖDEMESİ
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
                total: amount, // güvenlik için stripe tutarını esas al
                status: "accepted",
              },
            },
            { new: true }
          );

          if (order && sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
            await OrderSession.updateOne(
              { _id: sessionId },
              {
                $inc: {
                  "totals.cardTotal": amount,
                  "totals.grandTotal": amount,
                },
                $set: { lastOrderAt: new Date() },
              }
            );
          }

          break;
        }

        // ✅ 2) REZERVASYON DEPOZİTO ÖDEMESİ (MEVCUT)
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
          console.warn("[StripeWebhook] payment_intent.succeeded without valid reservationId/orderId");
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const metadata = pi.metadata || {};

        // ✅ 1) QR ORDER FAIL
        const orderId = metadata.orderId;
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
          await Order.updateOne(
            { _id: orderId },
            {
              $set: {
                stripePaymentIntentId: pi.id,
                paymentStatus: "failed",
              },
            }
          );
          break;
        }

        // ✅ 2) REZERVASYON FAIL (MEVCUT)
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
          console.warn("[StripeWebhook] payment_intent.payment_failed without valid reservationId/orderId");
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[StripeWebhook] handler error:", err?.message || err);
    res.status(500).send("Webhook handler error");
  }
};