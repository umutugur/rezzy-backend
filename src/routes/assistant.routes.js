// routes/assistant.routes.js
import { Router } from "express";
import { handleAssistantMessage } from "../controllers/assistant.controller.js";

const router = Router();

router.post("/message", handleAssistantMessage);

export default router;