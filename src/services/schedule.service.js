import { pool } from "../db.js";
import { toSqlDateTime } from "../lib/dates.js";

// helper: find overlaps in one table
function overlapSql(table) {
  return `
    SELECT id,title,venue_id,batch_id,start_utc,end_utc
    FROM ${table}
    WHERE venue_id = ?
      AND start_utc < ? AND end_utc > ?
    LIMIT 5
  `;
}

// helper: overlaps by batch
function overlapBatchSql(table) {
  return `
    SELECT id,title,venue_id,batch_id,start_utc,end_utc
    FROM ${table}
    WHERE batch_id = ?
      AND start_utc < ? AND end_utc > ?
    LIMIT 5
  `;
}

export async function createItem(table, body, userId, res) {
  const start = toSqlDateTime(body.start);
  const end = toSqlDateTime(body.end);

  // ✅ Check venue conflicts in BOTH tables (events + exams)
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
  const vconf = [...vconfEvents, ...vconfExams];

  // ✅ Check batch conflicts (optional, only same batch)
  let bconf = [];
  if (body.batchId) {
    const [bevents] = await pool.query(overlapBatchSql("events"), [
      body.batchId,
      end,
      start,
    ]);
    const [bexams] = await pool.query(overlapBatchSql("exams"), [
      body.batchId,
      end,
      start,
    ]);
    bconf = [...bevents, ...bexams];
  }

  // 🔒 enforce venue.allow_conflict
  if (vconf.length > 0) {
    const [[venue]] = await pool.query(
      "SELECT allow_conflict FROM venues WHERE id=?",
      [body.venueId]
    );

    if (!venue.allow_conflict) {
      return res.status(409).json({
        error:
          "Venue conflict detected. This venue does not allow overlapping events/exams.",
        conflicts: { venue: vconf },
      });
    }
  }

  // 🔒 enforce batch conflict always
  if (bconf.length > 0) {
    return res.status(409).json({
      error:
        "Batch conflict detected. Another event/exam overlaps for this batch.",
      conflicts: { batch: bconf },
    });
  }

  // ✅ Insert if allowed
  const [r] = await pool.query(
    `INSERT INTO ${table}
      (title, venue_id, department_id, batch_id, start_utc, end_utc, created_by)
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

  return { id: r.insertId, vconflicts: vconf, bconflicts: bconf };
}

export async function listItems(table, q) {
  let sql = `
    SELECT e.id, e.title, e.start_utc, e.end_utc,
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

export async function getConflicts({ start, end, venueId, batchId }) {
  const result = { venue: [], batch: [] };

  // Venue conflicts
  if (venueId) {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc, v.name AS venueName
       FROM events e
       JOIN venues v ON e.venue_id = v.id
       WHERE e.venue_id = ?
         AND e.start_utc < ?
         AND e.end_utc > ?`,
      [venueId, end, start]
    );
    result.venue = rows;
  }

  // Batch conflicts
  if (batchId) {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName
       FROM events e
       JOIN batches b ON e.batch_id = b.id
       WHERE e.batch_id = ?
         AND e.start_utc < ?
         AND e.end_utc > ?`,
      [batchId, end, start]
    );
    result.batch = rows;
  }

  return result;
}
