import { Router } from "express";
import auth from "./auth.routes.js";
import venueRoutes from "./venue.routes.js";
import eventRoutes from "./event.routes.js";
import examRoutes from "./exam.routes.js";
import departments from "./department.routes.js";
import batches from "./batch.routes.js";
import { requireAuth } from "../middleware/auth.js";
import scheduleRoutes from "./schedule.routes.js";
import audit from "./audit.routes.js";
import buildingRoutes from "./building.routes.js";
import studentRoutes from "./student.routes.js";
import chatbotRoutes from "./chatbot.routes.js";
import calenderRoutes from "./calender.routes.js";

const api = Router();

api.use("/auth", auth);
api.use("/venues", venueRoutes);
api.use("/events", eventRoutes);
api.use("/exams", examRoutes);
api.use("/departments", departments);
api.use("/batches", batches);
api.use("/schedules", scheduleRoutes);
api.use("/audit", audit);
api.use("/buildings", buildingRoutes);
api.use("/students", studentRoutes);
api.use("/chatbot", chatbotRoutes);
api.use("/calender", calenderRoutes);

// sample protected
api.get("/me", requireAuth, (req, res) =>
  res.json({ ok: true, user: req.user })
);

export default api;
