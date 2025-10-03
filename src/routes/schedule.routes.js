import { Router } from "express";
import {
  listAllSchedules,
  getConflicts,
} from "../controllers/schedule.controller.js";

const r = Router();

// GET /api/schedules
r.get("/", listAllSchedules);

// GET /api/schedules/conflicts
r.get("/conflicts", async (req, res) => {
  try {
    const { start, end, venueId, batchId, departmentId } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: "start and end are required" });
    }

    const conflicts = await getConflicts({
      start,
      end,
      venueId: venueId ? Number(venueId) : null,
      batchId: batchId ? Number(batchId) : null,
      departmentId: departmentId ? Number(departmentId) : null, // ✅ added
    });

    res.json(conflicts);
  } catch (e) {
    console.error("Conflict check failed:", e);
    res.status(500).json({ error: "Failed to fetch conflicts" });
  }
});

export default r;
