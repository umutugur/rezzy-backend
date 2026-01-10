import express from "express";
import { auth } from "../middlewares/auth.js";
import {
  listMyAddresses,
  createAddress,
  updateAddress,
  makeDefaultAddress,
  deleteAddress,
} from "../controllers/addressController.js";

const router = express.Router();

// /api/addresses
router.get("/", auth(true), listMyAddresses);
router.post("/", auth(true), createAddress);
router.put("/:id", auth(true), updateAddress);
router.post("/:id/make-default", auth(true), makeDefaultAddress);
router.delete("/:id", auth(true), deleteAddress);

export default router;