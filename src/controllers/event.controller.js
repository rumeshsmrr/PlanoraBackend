import { pool } from "../db.js";
import { createItem, listItems } from "../services/schedule.service.js";
import { logAudit } from "../services/audit.service.js";

export const EventController = {
  list: async (req, res) => {
    const rows = await listItems("events", req.query);
    res.json(rows);
  },

  create: async (req, res) => {
    const result = await createItem(
      "events",
      req.valid.body,
      req.user?.id,
      res
    );
    if (!result?.id) return; // blocked due to conflict

    const [[row]] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc,
              d.name AS departmentName,
              b.label AS batchName,
              v.name AS venueName
       FROM events e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id=?`,
      [result.id]
    );

    // 🔥 log to audit table
    await logAudit({
      title: `Created event "${row.title}"`,
      type: "create",
      actor: req.user?.name ?? "system",
      refId: row.id,
      refType: "event",
    });

    res.status(201).json({
      event: row,
      conflicts: { venue: result.vconflicts, batch: result.bconflicts },
    });
  },

  // ✅ prepare for later
  update: async (req, res) => {
    // ... update logic
    await logAudit({
      title: `Updated event "${req.body.title}"`,
      type: "update",
      actor: req.user?.name ?? "system",
      refId: req.valid.params.id,
      refType: "event",
    });
  },

  delete: async (req, res) => {
    // ... delete logic
    await logAudit({
      title: `Deleted event ID ${req.valid.params.id}`,
      type: "delete",
      actor: req.user?.name ?? "system",
      refId: req.valid.params.id,
      refType: "event",
    });
  },
};
