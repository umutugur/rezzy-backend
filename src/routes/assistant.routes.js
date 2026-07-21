// routes/assistant.routes.js
import { Router } from "express";
import {
  handleAssistantMessage,
  executeAssistantDraft,
  dismissAssistantDraft,
} from "../controllers/assistant.controller.js";
import { auth, authOptional } from "../middlewares/auth.js";

const router = Router();

router.post("/message", authOptional(), handleAssistantMessage);
// Yazma işlemleri yalnızca girişli kullanıcı — draft onay/vazgeç.
router.post("/execute", auth(), executeAssistantDraft);
router.post("/dismiss", auth(), dismissAssistantDraft);

export default router;
