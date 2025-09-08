// src/seed.js
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Restaurant from "./models/Restaurant.js";
import Menu from "./models/Menu.js";

dotenv.config();
await connectDB(process.env.MONGO_URI);

await Promise.all([User.deleteMany({}), Restaurant.deleteMany({}), Menu.deleteMany({})]);

const owner = await User.create({
  name:"Mekan Sahibi",
  email:"owner@rezzy.app",
  password:"123456",
  role:"restaurant",
  providers:[{name:"password", sub:"owner@rezzy.app"}]
});

const rests = await Restaurant.insertMany([
  {
    owner: owner._id,
    name:"Ada Meyhane",
    city:"Girne",
    phone:"+90 392 000 00 00",
    iban:"TR00 0000 0000 0000 0000 0000",
    priceRange:"₺₺",
    description:"Deniz esintili meyhane.",
    photos:["https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1600&auto=format&fit=crop"],
    depositRate:10
  },
  {
    owner: owner._id,
    name:"Liman Sofrası",
    city:"Gazimağusa",
    phone:"+90 392 000 00 01",
    iban:"TR00 0000 0000 0000 0000 0001",
    priceRange:"₺₺₺",
    description:"Meze ağırlıklı, canlı fasıl.",
    photos:["https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1600&auto=format&fit=crop"],
    depositRate:12
  },
  {
    owner: owner._id,
    name:"Kuzey Rakı",
    city:"Lefkoşa",
    phone:"+90 392 000 00 02",
    iban:"TR00 0000 0000 0000 0000 0002",
    priceRange:"₺₺",
    description:"Arkadaş grubuna ideal, klasik meyhane.",
    photos:["https://images.unsplash.com/photo-1559339367-049613e622d2?q=80&w=1600&auto=format&fit=crop"],
    depositRate:10
  }
]);

await Menu.insertMany([
  { restaurantId: rests[0]._id, title:"Fix Menü 1", description:"10 meze + 2 ara sıcak", pricePerPerson:500 },
  { restaurantId: rests[0]._id, title:"Fix Menü 2", description:"10 meze + 3 ara sıcak + içecek", pricePerPerson:650 },
  { restaurantId: rests[1]._id, title:"Ege Sofrası", description:"12 meze + balık", pricePerPerson:820 },
  { restaurantId: rests[1]._id, title:"Fasıl Gecesi", description:"Meze + sınırsız içecek", pricePerPerson:980 },
  { restaurantId: rests[2]._id, title:"Klasik", description:"8 meze + 1 ara sıcak", pricePerPerson:420 },
  { restaurantId: rests[2]._id, title:"Zengin", description:"12 meze + 2 ara sıcak", pricePerPerson:560 }
]);
const customer = await User.create({
  name: "Demo Müşteri",
  email: "demo@rezzy.app",
  password: "123456",
  role: "customer",
  providers: [{ name: "password", sub: "demo@rezzy.app" }],
});

console.log("✅ Seed tamam: restoran + menüler eklendi");
process.exit(0);
