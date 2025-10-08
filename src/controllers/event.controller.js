// 📂 src/controllers/event.controller.js
import { pool } from "../db.js";
import { createItem, listItems } from "../services/schedule.service.js";
import { logAudit } from "../services/audit.service.js";

export const EventController = {
  // ✅ List all events
  list: async (req, res) => {
    const rows = await listItems("events", req.query);
    res.json(rows);
  },

  // ✅ Create new event (with conflict detection + audit)
  create: async (req, res) => {
    const result = await createItem(
      "events",
      req.valid.body,
      req.user?.id,
      res
    );
    if (!result?.id) return; // blocked due to conflict

    // fetch inserted event + joins
    const [[row]] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc,
              d.name AS departmentName,
              b.label AS batchName,
              v.name AS venueName, v.capacity
       FROM events e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id=?`,
      [result.id]
    );

    // log creation
    await logAudit({
      title: `Created event "${row.title}"`,
      type: "create",
      actor: req.user?.name ?? "system",
      refId: row.id,
      refType: "event",
    });

    // optional: if this is a campus event, calculate total affected students (for analytics)
    let affectedStudents = 0;
    if (row.batchName?.toLowerCase() === "campus") {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM stundent`
      );
      affectedStudents = count;
    } else {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM stundent WHERE batch_id = ?`,
        [req.valid.body.batchId]
      );
      affectedStudents = count;
    }

    res.status(201).json({
      message: "Event created successfully",
      event: row,
      stats: { affectedStudents },
      conflicts: {
        venue: result.vconflicts,
        batch: result.bconflicts,
      },
    });
  },

  // ✅ Update event (future use)
  update: async (req, res) => {
    await logAudit({
      title: `Updated event "${req.body.title}"`,
      type: "update",
      actor: req.user?.name ?? "system",
      refId: req.valid.params.id,
      refType: "event",
    });
    res.json({ message: "Event update logged" });
  },

  // ✅ Delete event (future use)
  delete: async (req, res) => {
    await logAudit({
      title: `Deleted event ID ${req.valid.params.id}`,
      type: "delete",
      actor: req.user?.name ?? "system",
      refId: req.valid.params.id,
      refType: "event",
    });
    res.json({ message: "Event deleted successfully" });
  },
};
