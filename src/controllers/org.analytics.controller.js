// src/controllers/org.analytics.controller.js
import {
  resolveRange,
  orgSummary as orgSummarySvc,
  orgTimeseries as orgTimeseriesSvc,
  orgTopRestaurants as orgTopRestaurantsSvc,
  restaurantSummary as restaurantSummarySvc,
} from "../services/org.analytics.service.js";

export async function orgSummary(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { preset = "month", from, to } = req.query;
    const { start, end } = resolveRange({ preset, from, to });

    const data = await orgSummarySvc({ organizationId, start, end });
    return res.json(data);
  } catch (e) {
    return next(e);
  }
}

export async function orgTimeseries(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { preset = "month", from, to, tz = "Europe/Istanbul", bucket = "day", metric = "sales" } = req.query;
    const { start, end } = resolveRange({ preset, from, to });

    const data = await orgTimeseriesSvc({ organizationId, start, end, tz, bucket, metric });
    return res.json(data);
  } catch (e) {
    return next(e);
  }
}

export async function orgTopRestaurants(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { preset = "month", from, to, metric = "sales", limit = "10" } = req.query;
    const { start, end } = resolveRange({ preset, from, to });

    const data = await orgTopRestaurantsSvc({
      organizationId,
      start,
      end,
      metric,
      limit: Number(limit) || 10,
    });
    return res.json(data);
  } catch (e) {
    return next(e);
  }
}

export async function restaurantSummary(req, res, next) {
  try {
    const { restaurantId } = req.params;
    const { preset = "month", from, to } = req.query;
    const { start, end } = resolveRange({ preset, from, to });

    const data = await restaurantSummarySvc({ restaurantId, start, end });
    return res.json(data);
  } catch (e) {
    return next(e);
  }
}