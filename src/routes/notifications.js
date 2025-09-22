import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import User from "../models/User.js";

const r = Router();

/** POST /api/notifications/register
 * body: { token: "ExponentPushToken[xxx]" }
 */
r.post("/register", auth(), async (req, res) => {
  try {
    const token = (req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok:false, error:"token required" });

    const u = await User.findById(req.user.id).select("_id pushTokens").lean();
    if (!u) return res.status(404).json({ ok:false, error:"user not found" });

    // Aynı token varsa aktif et; yoksa ekle
    await User.updateOne(
      { _id: req.user.id, "pushTokens.token": token },
      { $set: { "pushTokens.$.isActive": true, "pushTokens.$.updatedAt": new Date() } }
    );

    const updated = await User.updateOne(
      { _id: req.user.id, "pushTokens.token": { $ne: token } },
      { $push: { pushTokens: { token, isActive: true, updatedAt: new Date() } } }
    );

    res.json({ ok:true, token, upserted: updated.modifiedCount > 0 });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

export default r;
