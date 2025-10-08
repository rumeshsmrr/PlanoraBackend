import { pool } from "../db.js";

/* ===========================================================
   📅 UNIFIED SCHEDULE LISTING (Events + Exams)
   =========================================================== */
export async function listAllSchedules(req, res) {
  const [rows] = await pool.query(`
    SELECT e.id, e.title, e.start_utc, e.end_utc,
           'event' AS type,
           d.name AS departmentName,
           b.label AS batchName,
           v.name AS venueName
    FROM events e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN batches b ON e.batch_id = b.id
    LEFT JOIN venues v ON e.venue_id = v.id

    UNION ALL

    SELECT ex.id, ex.title, ex.start_utc, ex.end_utc,
           'exam' AS type,
           d.name AS departmentName,
           b.label AS batchName,
           v.name AS venueName
    FROM exams ex
    LEFT JOIN departments d ON ex.department_id = d.id
    LEFT JOIN batches b ON ex.batch_id = b.id
    LEFT JOIN venues v ON ex.venue_id = v.id

    ORDER BY start_utc ASC
  `);
  res.json(rows);
}

/* ===========================================================
   🔍 CONFLICT CHECK (Campus-aware)
   =========================================================== */
export async function getConflicts({ start, end, venueId, batchId }) {
  const conflicts = [];

  /* ----------------------------
     ✅ Venue conflicts (same day)
  ---------------------------- */
  if (venueId) {
    const [venueConf] = await pool.query(
      `
      SELECT e.id, e.title, e.start_utc, e.end_utc, v.name AS venueName, 'event' AS type
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.venue_id = ? AND DATE(e.start_utc)=DATE(?)
        AND e.start_utc < ? AND e.end_utc > ?
      UNION ALL
      SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, v.name AS venueName, 'exam' AS type
      FROM exams ex
      JOIN venues v ON ex.venue_id = v.id
      WHERE ex.venue_id = ? AND DATE(ex.start_utc)=DATE(?)
        AND ex.start_utc < ? AND ex.end_utc > ?
      `,
      [venueId, start, end, start, venueId, start, end, start]
    );
    conflicts.push(...venueConf);
  }

  /* ----------------------------
     ✅ Batch conflicts (Campus-aware)
  ---------------------------- */
  if (batchId) {
    const [rows] = await pool.query(
      `
      SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
      FROM events e
      JOIN batches b ON e.batch_id = b.id
      WHERE DATE(e.start_utc)=DATE(?)
        AND e.start_utc < ? AND e.end_utc > ?
        AND (e.batch_id = ? OR b.label = 'Campus')
      UNION ALL
      SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
      FROM exams ex
      JOIN batches b ON ex.batch_id = b.id
      WHERE DATE(ex.start_utc)=DATE(?)
        AND ex.start_utc < ? AND ex.end_utc > ?
        AND (ex.batch_id = ? OR b.label = 'Campus')
      `,
      [start, end, start, batchId, start, end, start, batchId]
    );
    conflicts.push(...rows);
  }

  /* ----------------------------
     ✅ If batch = Campus → detect all
  ---------------------------- */
  const [[batch]] =
    batchId &&
    (await pool.query("SELECT label FROM batches WHERE id=?", [batchId]));
  if (batch?.label?.toLowerCase() === "campus") {
    const [campusConf] = await pool.query(
      `
      SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
      FROM events e
      LEFT JOIN batches b ON e.batch_id = b.id
      WHERE DATE(e.start_utc)=DATE(?) AND e.start_utc < ? AND e.end_utc > ?
      UNION ALL
      SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
      FROM exams ex
      LEFT JOIN batches b ON ex.batch_id = b.id
      WHERE DATE(ex.start_utc)=DATE(?) AND ex.start_utc < ? AND ex.end_utc > ?
      `,
      [start, end, start, start, end, start]
    );
    conflicts.push(...campusConf);
  }

  return conflicts;
}
