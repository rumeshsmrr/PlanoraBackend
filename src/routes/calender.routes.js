import express from "express";
import { getCalendarSchedules } from "../controllers/calender.controller.js";

const router = express.Router();

// ✅ Updated endpoint
router.get("/", getCalendarSchedules);

export default router;
