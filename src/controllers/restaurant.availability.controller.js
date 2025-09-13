import dayjs from "dayjs";
import Restaurant from "../models/Restaurant.js";
import Reservation from "../models/Reservation.js";

function toMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h||0)*60 + (m||0);
}
function fromMinutes(min) {
  const h = Math.floor(min/60).toString().padStart(2, "0");
  const m = (min%60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export const getAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const date = String(req.query.date);   // YYYY-MM-DD (müşteriden gelen)
    const partySize = Math.max(1, parseInt(String(req.query.partySize||"1"), 10));

    const rest = await Restaurant.findById(id).lean();
    if (!rest) return res.status(404).json({ message: "Restaurant not found" });

    // Kara gün / blackout
    if (Array.isArray(rest.blackoutDates) && rest.blackoutDates.includes(date)) {
      return res.json({ date, partySize, slots: [] });
    }

    const slotMinutes = Math.max(30, Number(rest.slotMinutes || 90));
    // Weekday: 0=Sunday..6=Saturday  -> date string’e göre hesap
    const wd = dayjs(`${date}T00:00:00`).day(); // server TZ
    const todayOH = (rest.openingHours || []).find(x => Number(x.day) === wd);
    if (!todayOH || todayOH.isClosed) {
      return res.json({ date, partySize, slots: [] });
    }

    const openMin  = toMinutes(todayOH.open || "10:00");
    const closeMin = toMinutes(todayOH.close || "23:00");
    if (closeMin <= openMin) return res.json({ date, partySize, slots: [] });

    // Masa kapasitesi: aktif masaların toplamı
    const cap = (rest.tables || [])
      .filter(t => t.isActive !== false)
      .reduce((a, t) => a + Math.max(1, Number(t.capacity || 0)), 0) || 0;

    // O günün rezervasyonlarını çek (gün aralığı)
    const start = dayjs(`${date}T00:00:00`).toDate();
    const end   = dayjs(`${date}T23:59:59`).toDate();
    const dayReservations = await Reservation.find({
      restaurantId: rest._id,
      dateTimeUTC: { $gte: start, $lte: end },
      status: { $in: ["pending","confirmed","arrived"] },
    }).lean();

    // Slotları oluştur
    const slots = [];
    for (let t = openMin; t + slotMinutes <= closeMin; t += 15) {
      const hhmm = fromMinutes(t);
      const slotDt = dayjs(`${date}T${hhmm}:00`);
      // geçmiş slotları dışla
      if (slotDt.isBefore(dayjs())) {
        slots.push({ timeISO: slotDt.toISOString(), label: hhmm, isAvailable: false, reason: "past" });
        continue;
      }

      // Aynı zamanlı rezervasyonların kişi toplamı (basit yaklaşım: exact slot eşitliği)
      const taken = dayReservations
        .filter(r => dayjs(r.dateTimeUTC).format("HH:mm") === hhmm)
        .reduce((a, r) => a + Number(r.partySize || 0), 0);

      const available = cap - taken >= partySize;
      slots.push({
        timeISO: slotDt.toISOString(),
        label: hhmm,
        isAvailable: available,
        reason: available ? undefined : (cap <= 0 ? "closed" : "full"),
      });
    }

    res.json({ date, partySize, slots });
  } catch (e) { next(e); }
};
