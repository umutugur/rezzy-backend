// routes/tableService.routes.js
import { Router } from "express";
import {
  createRequest,
  listRequests,
  handleRequest,
} from "../controllers/tableService.controller.js";

const router = Router();

router.post("/requests", createRequest);

// panel için
router.get("/requests", listRequests);
router.patch("/requests/:id/handle", handleRequest);

export default router;