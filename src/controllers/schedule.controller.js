import { pool } from "../db.js";

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

/**
 * 🔎 Central conflict checking across both events + exams
 */
export async function getConflicts({
  start,
  end,
  venueId,
  batchId,
  departmentId,
}) {
  const conflicts = [];

  // venue conflicts (events)
  if (venueId) {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc, v.name AS venueName, 'event' AS type
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.venue_id = ?
         AND e.start_utc < ?
         AND e.end_utc > ?`,
      [venueId, end, start]
    );
    conflicts.push(...rows);
  }

  // venue conflicts (exams)
  if (venueId) {
    const [rows] = await pool.query(
      `SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, v.name AS venueName, 'exam' AS type
       FROM exams ex
       JOIN venues v ON ex.venue_id = v.id
       WHERE ex.venue_id = ?
         AND ex.start_utc < ?
         AND ex.end_utc > ?`,
      [venueId, end, start]
    );
    conflicts.push(...rows);
  }

  // batch conflicts (events)
  if (batchId) {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
       FROM events e
       JOIN batches b ON e.batch_id = b.id
       WHERE e.batch_id = ?
         AND e.start_utc < ?
         AND e.end_utc > ?`,
      [batchId, end, start]
    );
    conflicts.push(...rows);
  }

  // batch conflicts (exams)
  if (batchId) {
    const [rows] = await pool.query(
      `SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
       FROM exams ex
       JOIN batches b ON ex.batch_id = b.id
       WHERE ex.batch_id = ?
         AND ex.start_utc < ?
         AND ex.end_utc > ?`,
      [batchId, end, start]
    );
    conflicts.push(...rows);
  }

  // department conflicts (events)
  if (departmentId) {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc, d.name AS departmentName, 'event' AS type
       FROM events e
       JOIN departments d ON e.department_id = d.id
       WHERE e.department_id = ?
         AND e.start_utc < ?
         AND e.end_utc > ?`,
      [departmentId, end, start]
    );
    conflicts.push(...rows);
  }

  // department conflicts (exams)
  if (departmentId) {
    const [rows] = await pool.query(
      `SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, d.name AS departmentName, 'exam' AS type
       FROM exams ex
       JOIN departments d ON ex.department_id = d.id
       WHERE ex.department_id = ?
         AND ex.start_utc < ?
         AND ex.end_utc > ?`,
      [departmentId, end, start]
    );
    conflicts.push(...rows);
  }

  return conflicts;
}
