import { pool } from "../db.js";

/* ===========================================================
   📅 UNIFIED SCHEDULE LISTING
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
   🔎 CENTRAL CONFLICT CHECK (Campus-aware & Unified)
   =========================================================== */

// Simple helper to check department label (case-insensitive)
async function isCampusDepartment(departmentId) {
  const [[deptInfo]] = await pool.query(
    "SELECT name FROM departments WHERE id=?",
    [departmentId]
  );
  return deptInfo?.name?.toLowerCase() === "campus";
}

/**
 * 🔎 Central conflict checking across both events + exams.
 */
export async function getConflicts({
  start,
  end,
  venueId,
  batchId,
  departmentId,
}) {
  const conflicts = []; // Determine if the requested check is for a 'Campus' batch (case-insensitive)

  let isCampusBatch = false;
  if (batchId) {
    const [batchRows] = await pool.query(
      "SELECT label FROM batches WHERE id=?",
      [batchId]
    );
    if (batchRows[0]?.label?.toLowerCase() === "campus") {
      isCampusBatch = true;
    }
  }
  const isCampusDept = departmentId
    ? await isCampusDepartment(departmentId)
    : false; // 1. Venue Conflicts (Time Overlap, Same Venue)

  if (venueId) {
    // 🛑 FIX: Ensure all lines are flush left to eliminate leading whitespace
    const venueSql = `SELECT e.id, e.title, e.start_utc, e.end_utc, v.name AS venueName, 'event' AS type
FROM events e JOIN venues v ON e.venue_id = v.id
WHERE e.venue_id = ? AND e.start_utc < ? AND e.end_utc > ?
UNION ALL
SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, v.name AS venueName, 'exam' AS type
FROM exams ex JOIN venues v ON ex.venue_id = v.id
WHERE ex.venue_id = ? AND ex.start_utc < ? AND ex.end_utc > ?`;

    const [rows] = await pool.query(venueSql, [
      venueId,
      end,
      start,
      venueId,
      end,
      start,
    ]);
    conflicts.push(...rows);
  } // 2. Batch/Campus Conflicts (Date and Time Overlap)

  if (batchId) {
    const batchConflictCheck = isCampusBatch
      ? ""
      : `(e.batch_id = ? OR LOWER(b.label) = 'campus')`; // 🛑 FIX: Ensure all lines are flush left to eliminate leading whitespace

    const batchSql = `SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
FROM events e LEFT JOIN batches b ON e.batch_id = b.id
WHERE DATE(e.start_utc) = DATE(?) AND e.start_utc < ? AND e.end_utc > ?
${batchConflictCheck ? `AND ${batchConflictCheck.replace(/e\./g, "e.")}` : ""}
UNION ALL
SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
FROM exams ex LEFT JOIN batches b ON ex.batch_id = b.id
WHERE DATE(ex.start_utc) = DATE(?) AND ex.start_utc < ? AND ex.end_utc > ?
${
  batchConflictCheck ? `AND ${batchConflictCheck.replace(/e\./g, "ex.")}` : ""
}`;
    const params = [start, end, start];
    if (!isCampusBatch) params.push(batchId);
    params.push(start, end, start);
    if (!isCampusBatch) params.push(batchId);

    const [rows] = await pool.query(batchSql, params);
    conflicts.push(...rows);
  } // 3. Special case: If checking for Campus batch or department, find ALL events on that day/time.

  if (isCampusBatch || isCampusDept) {
    // 🛑 FIX: Ensure all lines are flush left to eliminate leading whitespace
    const allCampusDaySql = `SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
FROM events e LEFT JOIN batches b ON e.batch_id = b.id
WHERE DATE(e.start_utc) = DATE(?) AND e.start_utc < ? AND e.end_utc > ?
UNION ALL
SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
FROM exams ex LEFT JOIN batches b ON ex.batch_id = b.id
WHERE DATE(ex.start_utc) = DATE(?) AND ex.start_utc < ? AND ex.end_utc > ?`;
    const [rows] = await pool.query(allCampusDaySql, [
      start,
      end,
      start,
      start,
      end,
      start,
    ]);
    conflicts.push(...rows);
  } // Filter out duplicates

  const uniqueConflicts = conflicts.filter(
    (item, index, self) =>
      index === self.findIndex((t) => t.id === item.id && t.type === item.type)
  );

  return uniqueConflicts;
}
