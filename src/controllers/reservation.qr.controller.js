import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import { generateQRDataURL } from "../utils/qr.js";

export const getReservationQR = async (req,res,next)=>{
  try{
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if(!r) return res.status(404).json({ message:"Reservation not found" });

    // sadece ilgili kullanıcı veya restoran sahibi görebilsin
    const userId = req.user.id;
    const isOwner = (req.user.role === "admin") ||
      (req.user.role === "restaurant" && String(r.restaurantId.owner) === String(userId));
    const isCustomer = (req.user.role === "customer" && String(r.userId) === String(userId));
    if(!(isOwner || isCustomer)) return res.status(403).json({ message:"Forbidden" });

    if (r.status !== "confirmed") return res.status(400).json({ message:"QR sadece onaylı rezervasyonda gösterilir" });

    const ts = r.dateTimeUTC.toISOString();
    const qr = await generateQRDataURL({ rid: r._id.toString(), mid: r.restaurantId._id.toString(), ts });
    res.json({ qrDataUrl: qr });
  }catch(e){ next(e); }
};
