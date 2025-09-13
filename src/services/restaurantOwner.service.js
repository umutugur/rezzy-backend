// services/restaurantOwner.service.js
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";

/**
 * User role === 'restaurant' ise ve restaurantId yoksa:
 * - yeni Restaurant oluşturur
 * - Restaurant.owner = user._id
 * - user.restaurantId = restaurant._id olarak kaydeder
 * Her zaman ilişkili restoranı döndürür.
 */
export async function ensureRestaurantForOwner(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.role !== "restaurant") return null;

  if (user.restaurantId) {
    const exist = await Restaurant.findById(user.restaurantId);
    if (exist) return exist;
  }

  const name = user.name?.trim() || "Yeni Restoran";
  const created = await Restaurant.create({ owner: user._id, name });
  user.restaurantId = created._id;
  await user.save();

  return created;
}
