// controllers/user.controller.js
import User from "../models/User.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import bcrypt from "bcrypt";

/** GET /users/me */
export const getMe = async (req,res,next)=>{
  try{
    const u = await User.findById(req.user.id)
      .select("_id name email phone role restaurantId avatarUrl notificationPrefs providers createdAt updatedAt");
    if(!u) return res.status(404).json({message:"User not found"});
    res.json({
      user: {
        _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role,
        restaurantId: u.restaurantId, avatarUrl: u.avatarUrl, notificationPrefs: u.notificationPrefs,
        providers: (u.providers||[]).map(p=>p.name), createdAt: u.createdAt, updatedAt: u.updatedAt
      }
    });
  }catch(e){ next(e); }
};

/** PATCH /users/me  (name, phone, notificationPrefs, optionally email) */
export const updateMe = async (req,res,next)=>{
  try{
    const allowed = {};
    const { name, phone, email, notificationPrefs } = req.body || {};
    if (name != null) allowed.name = String(name).trim().slice(0, 80);
    if (phone != null) allowed.phone = String(phone).trim().slice(0, 40);
    if (email != null) allowed.email = String(email).trim().toLowerCase();
    if (notificationPrefs && typeof notificationPrefs === "object") {
      allowed["notificationPrefs.push"]  = !!notificationPrefs.push;
      allowed["notificationPrefs.sms"]   = !!notificationPrefs.sms;
      allowed["notificationPrefs.email"] = !!notificationPrefs.email;
    }

    const u = await User.findByIdAndUpdate(req.user.id, { $set: allowed }, { new:true })
      .select("_id name email phone role restaurantId avatarUrl notificationPrefs providers");
    if(!u) return res.status(404).json({message:"User not found"});
    res.json({ ok:true, user: {
      _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role,
      restaurantId: u.restaurantId, avatarUrl: u.avatarUrl, notificationPrefs: u.notificationPrefs,
      providers: (u.providers||[]).map(p=>p.name),
    }});
  }catch(e){ next(e); }
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
      folder: process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/avatars` : "rezzy/avatars",
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
    if (!newPassword || String(newPassword).length < 6)
      return res.status(400).json({ message: "Yeni şifre en az 6 karakter olmalı" });

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
