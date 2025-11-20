// controllers/stripe.webhook.controller.js
import Stripe from "stripe";
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";

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
    // express.raw kullanıldığı için req.body burada Buffer
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
          console.warn("[StripeWebhook] payment_intent.succeeded without valid reservationId");
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const metadata = pi.metadata || {};
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
          console.warn("[StripeWebhook] payment_intent.payment_failed without valid reservationId");
        }
        break;
      }

      default:
        // Şimdilik diğer event türlerini görmezden geliyoruz
        break;
    }

    // Stripe'a event'i aldığımızı belirt
    res.json({ received: true });
  } catch (err) {
    console.error("[StripeWebhook] handler error:", err?.message || err);
    // Stripe webhook tekrar deneyecek, bu yüzden 500 göndermek normal
    res.status(500).send("Webhook handler error");
  }
};