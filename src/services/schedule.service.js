import { pool } from "../db.js";
import { toSqlDateTime } from "../lib/dates.js";

/* ===========================================================
   🧮 SQL TEMPLATES
   =========================================================== */
function overlapVenueSql(table) {
  return `
    SELECT id, title, venue_id, batch_id, start_utc, end_utc
    FROM ${table}
    WHERE venue_id = ?
      AND DATE(start_utc) = DATE(?)
      AND start_utc < ? AND end_utc > ?
  `;
}

// ✅ includes campus-aware batch logic
function overlapBatchSql(table) {
  return `
    SELECT e.id, e.title, e.venue_id, e.batch_id, e.start_utc, e.end_utc, b.label
    FROM ${table} e
    LEFT JOIN batches b ON e.batch_id = b.id
    WHERE DATE(e.start_utc) = DATE(?)
      AND e.start_utc < ? AND e.end_utc > ?
      AND (
        b.label = 'Campus'      -- existing campus
        OR e.batch_id = ?       -- same batch
      )
  `;
}

/* ===========================================================
   ✳️ CREATE WITH CAMPUS LOGIC
   =========================================================== */
export async function createItem(table, body, userId, res) {
  const start = toSqlDateTime(body.start);
  const end = toSqlDateTime(body.end);

  // fetch batch info
  let batchLabel = null;
  if (body.batchId) {
    const [[b]] = await pool.query("SELECT label FROM batches WHERE id=?", [
      body.batchId,
    ]);
    batchLabel = b?.label ?? null;
  }

  /* ----------------------------
     ✅ 1. Venue Conflicts
  ---------------------------- */
  const [venueEvents] = await pool.query(overlapVenueSql("events"), [
    body.venueId,
    start,
    end,
    start,
  ]);
  const [venueExams] = await pool.query(overlapVenueSql("exams"), [
    body.venueId,
    start,
    end,
    start,
  ]);
  const vconf = [...venueEvents, ...venueExams];

  /* ----------------------------
     ✅ 2. Batch Conflicts
  ---------------------------- */
  let bconf = [];
  if (body.batchId) {
    const [bevents] = await pool.query(overlapBatchSql("events"), [
      start,
      end,
      start,
      body.batchId,
    ]);
    const [bexams] = await pool.query(overlapBatchSql("exams"), [
      start,
      end,
      start,
      body.batchId,
    ]);
    bconf = [...bevents, ...bexams];
  }

  /* ----------------------------
     ✅ 3. If creating CAMPUS event/exam
        → Check all batches that day
  ---------------------------- */
  if (batchLabel?.toLowerCase() === "campus") {
    const [cevents] = await pool.query(
      `
      SELECT e.id, e.title, e.start_utc, e.end_utc, b.label AS batchName, 'event' AS type
      FROM events e
      LEFT JOIN batches b ON e.batch_id = b.id
      WHERE DATE(e.start_utc) = DATE(?)
        AND e.start_utc < ? AND e.end_utc > ?
    `,
      [start, end, start]
    );
    const [cexams] = await pool.query(
      `
      SELECT ex.id, ex.title, ex.start_utc, ex.end_utc, b.label AS batchName, 'exam' AS type
      FROM exams ex
      LEFT JOIN batches b ON ex.batch_id = b.id
      WHERE DATE(ex.start_utc) = DATE(?)
        AND ex.start_utc < ? AND ex.end_utc > ?
    `,
      [start, end, start]
    );
    bconf.push(...cevents, ...cexams);
  }

  /* ----------------------------
     🔒 Apply Conflict Rules
  ---------------------------- */
  // venue rule
  if (vconf.length > 0) {
    const [[venue]] = await pool.query(
      "SELECT allow_conflict FROM venues WHERE id=?",
      [body.venueId]
    );
    if (!venue?.allow_conflict) {
      return res.status(409).json({
        error:
          "Venue conflict detected. This venue does not allow overlapping events/exams.",
        conflicts: { venue: vconf },
      });
    }
  }

  // batch rule
  if (bconf.length > 0) {
    return res.status(409).json({
      error:
        "Batch conflict detected. Overlapping with another batch or campus-wide schedule.",
      conflicts: { batch: bconf },
    });
  }

  /* ----------------------------
     ✅ 4. Create record
  ---------------------------- */
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

/* ===========================================================
   📋 LIST ITEMS
   =========================================================== */
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
