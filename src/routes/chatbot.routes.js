// src/routes/chat.routes.js
import { Router } from "express";
import { handleChat } from "../controllers/chat.controller.js";

const router = Router();

// POST /api/chatbot/message
router.post("/message", handleChat);

export default router;
