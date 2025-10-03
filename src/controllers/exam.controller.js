import { pool } from "../db.js";
import { createItem, listItems } from "../services/schedule.service.js";
import { logAudit } from "../services/audit.service.js";

export const ExamController = {
  list: async (req, res) => {
    const rows = await listItems("exams", req.query);
    res.json(rows);
  },

  create: async (req, res) => {
    const result = await createItem("exams", req.valid.body, req.user?.id, res);
    if (!result?.id) return; // blocked due to conflict

    const [[row]] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc,
              d.name AS departmentName,
              b.label AS batchName,
              v.name AS venueName
       FROM exams e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id=?`,
      [result.id]
    );

    // 🔥 log to audit table
    await logAudit({
      title: `Scheduled exam "${row.title}"`,
      type: "schedule",
      actor: req.user?.name ?? "system",
      refId: row.id,
      refType: "exam",
    });

    res.status(201).json({
      exam: row,
      conflicts: { venue: result.vconflicts, batch: result.bconflicts },
    });
  },
};
