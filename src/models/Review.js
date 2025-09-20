import mongoose from "mongoose";
const ReviewSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rating:       { type: Number, min:1, max:5, required: true },
  comment:      { type: String },
  status:       { type: String, enum:["visible","hidden","removed"], default:"visible", index:true },
}, { timestamps:true });
export default mongoose.model("Review", ReviewSchema);
