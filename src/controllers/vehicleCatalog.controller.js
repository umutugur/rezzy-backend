import VehicleMake from "../models/VehicleMake.js";
import VehicleModel from "../models/VehicleModel.js";

const norm = (c) => String(c || "").toUpperCase().trim();

export const listMakes = async (req, res, next) => {
  try {
    const country = norm(req.query.country);
    if (!country) return next({ status: 400, message: "country zorunlu" });
    const items = await VehicleMake.find({ countryCode: country, isActive: true })
      .sort({ order: 1, name: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

export const listModels = async (req, res, next) => {
  try {
    const country = norm(req.query.country);
    const make = String(req.query.make || "").trim();
    if (!country || !make) return next({ status: 400, message: "country ve make zorunlu" });
    const items = await VehicleModel.find({ countryCode: country, make, isActive: true })
      .sort({ order: 1, name: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};
