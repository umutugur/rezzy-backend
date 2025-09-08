import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";

export const createRestaurant = async (req,res,next)=>{
  try{
    const body = { ...req.body, owner: req.user.id };
    const rest = await Restaurant.create(body);
    res.json(rest);
  }catch(e){ next(e); }
};

export const listRestaurants = async (req,res,next)=>{
  try{
    const q = { isActive:true };
    if (req.query.city) q.city = req.query.city;
    const data = await Restaurant.find(q).select("name city priceRange rating photos description");
    res.json(data);
  }catch(e){ next(e); }
};

export const getRestaurant = async (req,res,next)=>{
  try{
    const rest = await Restaurant.findById(req.params.id);
    if (!rest) throw { status:404, message:"Restaurant not found" };
    const menus = await Menu.find({ restaurantId: rest._id, isActive:true });
    res.json({ ...rest.toObject(), menus });
  }catch(e){ next(e); }
};

export const createMenu = async (req,res,next)=>{
  try{
    // owner kontrolü (admin hariç)
    if (req.user.role !== "admin") {
      const r = await Restaurant.findById(req.params.id);
      if (!r || r.owner.toString() !== req.user.id) throw { status:403, message:"Forbidden" };
    }
    const m = await Menu.create({ ...req.body, restaurantId: req.params.id });
    res.json(m);
  }catch(e){ next(e); }
};
