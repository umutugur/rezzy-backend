// src/middlewares/allowMarketPanel.js
// Market paneline giriş: admin | market_owner | marketMemberships'i olan kullanıcı.
export function allowMarketPanel() {
  return (req, res, next) => {
    const u = req.user || {};
    if (u.role === "admin" || u.role === "market_owner") return next();
    const mm = Array.isArray(u.marketMemberships) ? u.marketMemberships : [];
    if (mm.length > 0) return next();
    return res.status(403).json({ message: "Market paneline erişiminiz yok" });
  };
}
