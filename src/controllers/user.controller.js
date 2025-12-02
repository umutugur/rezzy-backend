// controllers/user.controller.js
import User from "../models/User.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import bcrypt from "bcrypt";

/** GET /users/me */
/** GET /users/me */
export const getMe = async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id)
      .select(
        "_id name email phone role restaurantId avatarUrl notificationPrefs providers preferredRegion preferredLanguage createdAt updatedAt"
      );

    if (!u) return res.status(404).json({ message: "User not found" });

    res.json({
      user: {
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        restaurantId: u.restaurantId,
        avatarUrl: u.avatarUrl,
        notificationPrefs: u.notificationPrefs,
        providers: (u.providers || []).map((p) => p.name),
        preferredRegion: u.preferredRegion,
        preferredLanguage: u.preferredLanguage,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

/** PATCH /users/me  (name, phone, notificationPrefs, optionally email, preferredRegion, preferredLanguage) */
export const updateMe = async (req, res, next) => {
  try {
    const allowed = {};
    const {
      name,
      phone,
      email,
      notificationPrefs,
      preferredRegion,
      preferredLanguage,
    } = req.body || {};

    if (name != null) {
      allowed.name = String(name).trim().slice(0, 80);
    }

    if (phone != null) {
      allowed.phone = String(phone).trim().slice(0, 40);
    }

    if (email != null) {
      allowed.email = String(email).trim().toLowerCase();
    }

    if (notificationPrefs && typeof notificationPrefs === "object") {
      allowed["notificationPrefs.push"] = !!notificationPrefs.push;
      allowed["notificationPrefs.sms"] = !!notificationPrefs.sms;
      allowed["notificationPrefs.email"] = !!notificationPrefs.email;
    }

    // 🔹 Bölge (ülke) tercihi
    if (preferredRegion != null) {
      allowed.preferredRegion = String(preferredRegion).trim();
    }

    // 🔹 Dil tercihi
    if (preferredLanguage != null) {
      allowed.preferredLanguage = String(preferredLanguage).trim();
    }

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $set: allowed },
      { new: true }
    ).select(
      "_id name email phone role restaurantId avatarUrl notificationPrefs providers preferredRegion preferredLanguage"
    );

    if (!u) return res.status(404).json({ message: "User not found" });

    res.json({
      ok: true,
      user: {
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        restaurantId: u.restaurantId,
        avatarUrl: u.avatarUrl,
        notificationPrefs: u.notificationPrefs,
        providers: (u.providers || []).map((p) => p.name),
        preferredRegion: u.preferredRegion,
        preferredLanguage: u.preferredLanguage,
      },
    });
  } catch (e) {
    next(e);
  }
};

/** POST /users/me/avatar (multipart) */
export const uploadAvatar = async (req,res,next)=>{
  try{
    const f = req.file
      || (Array.isArray(req.files) && req.files[0])
      || (req.files?.file && req.files.file[0])
      || (req.files?.avatar && req.files.avatar[0]);
    if (!f || !f.buffer) return res.status(400).json({ message: "Dosya yüklenmedi" });

    const up = await uploadBufferToCloudinary(f.buffer, {
      folder: process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/avatars` : "rezvix/avatars",
      resource_type: "image",
    });

    const u = await User.findByIdAndUpdate(req.user.id, { $set: { avatarUrl: up.secure_url } }, { new:true })
      .select("_id name email phone role restaurantId avatarUrl notificationPrefs providers");
    if(!u) return res.status(404).json({message:"User not found"});

    res.json({ ok:true, avatarUrl: u.avatarUrl });
  }catch(e){ next(e); }
};

/** POST /auth/change-password  (sadece password provider için) */
export const changePassword = async (req,res,next)=>{
  try{
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
  return res.status(400).json({ message: "Yeni şifre en az 8 karakter olmalı" });
}

    const u = await User.findById(req.user.id).select("+password providers");
    if(!u) return res.status(404).json({message:"User not found"});

    const hasPasswordProvider = (u.providers||[]).some(p => p.name === "password");
    if (!hasPasswordProvider) return res.status(400).json({ message: "Şifre değişikliği yalnız şifreli hesaplar için geçerli" });

    if (!u.password) return res.status(400).json({ message: "Şifre alanı bulunamadı" });
    const ok = await u.compare(currentPassword || "");
    if (!ok) return res.status(400).json({ message: "Mevcut şifre hatalı" });

    u.password = newPassword;
    await u.save();
    res.json({ ok:true });
  }catch(e){ next(e); }
};
/** DELETE /users/me (Apple compliance: account deletion) */
export const deleteMe = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Kimlik doğrulaması gerekli" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

    // Eğer restoran sahibi ise ilişkili restoranı null’a çek veya ayrı işlem yap
    if (user.role === "restaurant" && user.restaurantId) {
      // örnek: restoran kaydı silme yerine "inactive" işaretleyebilirsin
      // await Restaurant.findByIdAndUpdate(user.restaurantId, { isActive: false });
    }

    await User.findByIdAndDelete(userId);

    res.json({ ok: true, message: "Hesap kalıcı olarak silindi" });
  } catch (e) {
    next(e);
  }
};