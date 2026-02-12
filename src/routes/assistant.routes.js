// routes/assistant.routes.js
import { Router } from "express";
import { handleAssistantMessage } from "../controllers/assistant.controller.js";
import { authOptional } from "../middlewares/auth.js";

const router = Router();

router.post("/message", authOptional(), handleAssistantMessage);

export default router;
