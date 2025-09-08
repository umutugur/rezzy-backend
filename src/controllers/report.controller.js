import Reservation from "../models/Reservation.js";

export const restaurantKpis = async (req,res,next)=>{
  try{
    const { id } = req.params;
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now()-30*864e5);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const pipeline = [
      { $match: { restaurantId: id, createdAt: { $gte: from, $lte: to } } },
      { $group: {
        _id: "$status",
        count: { $sum: 1 },
        deposit: { $sum: "$depositAmount" }
      }}
    ];
    const rows = await Reservation.aggregate(pipeline);
    const byStatus = Object.fromEntries(rows.map(r=>[r._id, r]));

    res.json({
      total: rows.reduce((a,c)=>a+c.count,0),
      arrived: byStatus.arrived?.count||0,
      no_show: byStatus.no_show?.count||0,
      cancelled: byStatus.cancelled?.count||0,
      confirmed: byStatus.confirmed?.count||0,
      depositTotal: rows.reduce((a,c)=>a+c.deposit,0)
    });
  }catch(e){ next(e); }
};
