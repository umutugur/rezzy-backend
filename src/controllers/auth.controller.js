import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(u){
  return jwt.sign(
    { id: u._id, role: u.role, name: u.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES }
  );
}
function ensureProvider(user, providerName, sub){
  const exists = user.providers?.some(p => p.name === providerName && p.sub === sub);
  if (!exists) {
    user.providers = user.providers || [];
    user.providers.push({ name: providerName, sub });
  }
}

export const register = async (req,res,next)=>{
  try{
    const { name, email, phone, password, role } = req.body;
    const user = await User.create({
      name, email, phone, password, role: role || "customer",
      providers: [{ name:"password", sub: email || phone || "local" }]
    });
    res.json({ token: signToken(user) });
  }catch(e){ next(e); }
};

export const login = async (req,res,next)=>{
  try{
    const { email, phone, password } = req.body;
    const query = email ? { email } : { phone };
    const user = await User.findOne(query).select("+password");
    if(!user || !(await user.compare(password))) throw { status:400, message:"Geçersiz bilgiler" };
    ensureProvider(user, "password", email || phone || "local");
    await user.save();
    res.json({ token: signToken(user) });
  }catch(e){ next(e); }
};

export const googleLogin = async (req,res,next)=>{
  try{
    const { idToken } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload(); // { sub, email, name, ... }
    const sub = payload.sub;
    const email = payload.email;
    const name = payload.name || (email ? email.split("@")[0] : "GoogleUser");

    let user = await User.findOne({ providers: { $elemMatch: { name:"google", sub } } });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ name, email, role:"customer", providers:[{ name:"google", sub }] });
    } else {
      ensureProvider(user, "google", sub);
      if (!user.email && email) user.email = email;
      await user.save();
    }
    res.json({ token: signToken(user) });
  }catch(e){ next(e); }
};

export const appleLogin = async (req,res,next)=>{
  try{
    const { identityToken } = req.body;
    const tokenData = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID, ignoreExpiration: false
    });
    const sub = tokenData.sub;
    const email = tokenData.email;
    const name = "AppleUser";

    let user = await User.findOne({ providers: { $elemMatch: { name:"apple", sub } } });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ name, email, role:"customer", providers:[{ name:"apple", sub }] });
    } else {
      ensureProvider(user, "apple", sub);
      if (!user.email && email) user.email = email;
      await user.save();
    }
    res.json({ token: signToken(user) });
  }catch(e){ next(e); }
};
