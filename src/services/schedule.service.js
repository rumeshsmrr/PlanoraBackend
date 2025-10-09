import { pool } from "../db.js";
import { toSqlDateTime } from "../lib/dates.js";

// Helper: find overlaps in one table
function overlapSql(table) {
  return `SELECT id, title, venue_id, batch_id, start_utc, end_utc
    FROM ${table}
    WHERE venue_id = ?
      AND start_utc < ? AND end_utc > ?
    LIMIT 5`;
}

/* ===========================================================
   🧮 SQL TEMPLATES FOR CAMPUS LOGIC (Case-Insensitive)
   =========================================================== */

// Used when creating a SPECIFIC batch event (non-campus)
function getBatchConflictsSql(table, isNewCampusEvent) {
  const campusCheck = isNewCampusEvent
    ? `OR e.batch_id IS NULL OR LOWER(b.label) = 'campus'`
    : `OR LOWER(b.label) = 'campus'`;

  return `SELECT e.id, e.title, e.venue_id, e.batch_id, e.start_utc, e.end_utc, b.label
FROM ${table} e
LEFT JOIN batches b ON e.batch_id = b.id
WHERE DATE(e.start_utc) = DATE(?)
  AND e.start_utc < ? AND e.end_utc > ?
  AND (
    e.batch_id = ?         
    ${campusCheck}          
  )
LIMIT 10`;
}

// Used when creating a CAMPUS event (batch or department)
function getAllCampusDayConflictsSql(table) {
  return `SELECT e.id, e.title, e.venue_id, e.batch_id, e.start_utc, e.end_utc, b.label AS batchName
FROM ${table} e
LEFT JOIN batches b ON e.batch_id = b.id
WHERE DATE(e.start_utc) = DATE(?)
  AND e.start_utc < ? AND e.end_utc > ?
LIMIT 10`;
}

/**
 * ✳️ CREATE ITEM (Event/Exam) WITH COMPREHENSIVE CONFLICT LOGIC
 */
export async function createItem(table, body, userId, res) {
  const start = toSqlDateTime(body.start);
  const end = toSqlDateTime(body.end);

  let campusBatchId = null;
  let isCampusEvent = false;

  if (body.batchId) {
    const [[batchInfo]] = await pool.query(
      "SELECT id, label FROM batches WHERE id=?",
      [body.batchId]
    );
    if (batchInfo?.label?.toLowerCase() === "campus") {
      campusBatchId = batchInfo.id;
      isCampusEvent = true;
    }
  }
  if (!isCampusEvent && body.departmentId) {
    const [[deptInfo]] = await pool.query(
      "SELECT name FROM departments WHERE id=?",
      [body.departmentId]
    );
    if (deptInfo?.name?.toLowerCase() === "campus") {
      isCampusEvent = true;
    }
  } /* ----------------------------
     ✅ 1. Venue Conflicts
    ---------------------------- */

  const [vconfEvents] = await pool.query(overlapSql("events"), [
    body.venueId,
    end,
    start,
  ]);
  const [vconfExams] = await pool.query(overlapSql("exams"), [
    body.venueId,
    end,
    start,
  ]);
  const vconf = [...vconfEvents, ...vconfExams]; /* ----------------------------
     ✅ 2. Batch/Campus Conflicts
    ---------------------------- */

  let bconf = [];
  if (body.batchId || isCampusEvent) {
    const batchIdForQuery = body.batchId ?? 0;

    const [bevents] = await pool.query(
      getBatchConflictsSql("events", isCampusEvent),
      [start, end, start, batchIdForQuery, campusBatchId]
    );
    const [bexams] = await pool.query(
      getBatchConflictsSql("exams", isCampusEvent),
      [start, end, start, batchIdForQuery, campusBatchId]
    );
    bconf = [...bevents, ...bexams];

    if (isCampusEvent) {
      const [allEvents] = await pool.query(
        getAllCampusDayConflictsSql("events"),
        [start, end, start]
      );
      const [allExams] = await pool.query(
        getAllCampusDayConflictsSql("exams"),
        [start, end, start]
      );
      bconf.push(...allEvents, ...allExams);
    }
  } /* ----------------------------
     🔒 Apply Conflict Rules
    ---------------------------- */

  if (vconf.length > 0) {
    const [[venue]] = await pool.query(
      "SELECT allow_conflict FROM venues WHERE id=?",
      [body.venueId]
    );
    if (!venue || !venue.allow_conflict) {
      return res.status(409).json({
        error:
          "Venue conflict detected. This venue does not allow overlapping events/exams.",
        conflicts: { venue: vconf },
      });
    }
  }

  const uniqueBconf = bconf.filter(
    (item, index, self) => index === self.findIndex((t) => t.id === item.id)
  );
  if (uniqueBconf.length > 0) {
    return res.status(409).json({
      error:
        "Batch conflict detected. Overlapping with the same batch or a Campus-wide schedule.",
      conflicts: { batch: uniqueBconf },
    });
  } /* ----------------------------
     ✅ 3. Create record
    ---------------------------- */

  const [r] = await pool.query(
    `INSERT INTO ${table} (title, venue_id, department_id, batch_id, start_utc, end_utc, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      body.title,
      body.venueId,
      body.departmentId ?? null,
      body.batchId ?? null,
      start,
      end,
      userId ?? null,
    ]
  );

  return { id: r.insertId, vconflicts: vconf, bconflicts: uniqueBconf };
}

/* ===========================================================
   📋 LIST ITEMS
   =========================================================== */
export async function listItems(table, q) {
  let sql = `SELECT e.id, e.title, e.start_utc, e.end_utc,
d.name AS departmentName,
b.label AS batchName,
v.name AS venueName
FROM ${table} e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN batches b ON e.batch_id = b.id
LEFT JOIN venues v ON e.venue_id = v.id
WHERE 1=1
`;
  const params = [];
  if (q?.venueId) {
    sql += " AND e.venue_id=?";
    params.push(q.venueId);
  }
  if (q?.batchId) {
    sql += " AND e.batch_id=?";
    params.push(q.batchId);
  }
  if (q?.from) {
    sql += " AND e.end_utc >= ?";
    params.push(toSqlDateTime(q.from));
  }
  if (q?.to) {
    sql += " AND e.start_utc <= ?";
    params.push(toSqlDateTime(q.to));
  }
  sql += " ORDER BY e.start_utc ASC LIMIT 500";

  const [rows] = await pool.query(sql, params);
  return rows;
}
