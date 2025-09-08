// src/middlewares/auth.js
import jwt from "jsonwebtoken";

export function auth(required = true) {
  return (req, res, next) => {
    try {
      const raw = req.headers.authorization || "";
      console.log("AUTH HEADER:", raw);            // ⬅️ Debug
      const token = raw.replace("Bearer ", "");
      if (!token) {
        if (required) throw { status: 401, message: "No token" };
        else return next();
      }
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      console.log("JWT OK for user:", payload);    // ⬅️ Debug
      req.user = payload;
      next();
    } catch (e) {
      console.log("JWT ERROR:", e?.message);       // ⬅️ Neyi beğenmiyor?
      next({ status: 401, message: "Unauthorized" });
    }
  };
}
