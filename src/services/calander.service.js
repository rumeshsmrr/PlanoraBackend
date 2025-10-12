import { pool } from "../db.js";

/**
 * Fetch all events + exams for calendar view.
 */
export async function getAllSchedules() {
  try {
    const [rows] = await pool.query(`
      SELECT 
        e.id,
        e.title,
        e.start_utc,
        e.end_utc,
        v.name AS venueName,
        b.label AS batchName,
        d.name AS departmentName,
        'event' AS type
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN batches b ON e.batch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id

      UNION ALL

      SELECT 
        ex.id,
        ex.title,
        ex.start_utc,
        ex.end_utc,
        v.name AS venueName,
        b.label AS batchName,
        d.name AS departmentName,
        'exam' AS type
      FROM exams ex
      LEFT JOIN venues v ON ex.venue_id = v.id
      LEFT JOIN batches b ON ex.batch_id = b.id
      LEFT JOIN departments d ON ex.department_id = d.id

      ORDER BY start_utc ASC;
    `);

    return rows;
  } catch (error) {
    console.error("Error fetching schedules:", error);
    throw error;
  }
}
