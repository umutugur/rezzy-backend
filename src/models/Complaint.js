import mongoose from "mongoose";
const ComplaintSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  subject:      { type: String, required: true },
  text:         { type: String, required: true },
  status:       { type: String, enum:["open","resolved","dismissed"], default:"open", index:true },
}, { timestamps:true });
export default mongoose.model("Complaint", ComplaintSchema);
