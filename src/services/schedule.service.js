import { success } from "zod";
import { pool } from "../db.js";
import { toSqlDateTime } from "../lib/dates.js";
import e from "express";

/* ---------------------------------------------
   ✅ SQL Helper Functions
--------------------------------------------- */
// Located in schedule.service.js
const overlapSql = (table, itemId = null) => {
  // Ensure the query starts with a clean SELECT and standard spacing/indentation
  return `SELECT id, title, venue_id, batch_id, start_utc, end_utc
FROM ${table}
WHERE venue_id = ?
  AND start_utc < ?
  AND end_utc > ?
  ${itemId ? `AND id != ${itemId}` : ""}`;
};

const getBatchConflictsSql = (table, isCampusEvent, itemId = null) => {
  const exclusion = itemId ? `AND id != ${itemId}` : "";

  if (isCampusEvent) {
    // campus event — overlaps with anything
    return `SELECT id, title, venue_id, batch_id, start_utc, end_utc
FROM ${table}
WHERE (? < end_utc AND ? > start_utc)
  ${exclusion}`; // Apply exclusion here
  }

  // normal batch event
  return `SELECT id, title, venue_id, batch_id, start_utc, end_utc
FROM ${table}
WHERE (? < end_utc AND ? > start_utc)
  AND (batch_id = ? OR batch_id IS NULL)
  ${exclusion}`; // Apply exclusion here
};

const getAllCampusDayConflictsSql = (table, itemId = null) => {
  return `SELECT id, title, venue_id, batch_id, start_utc, end_utc
FROM ${table}
WHERE (? < end_utc AND ? > start_utc)
  ${itemId ? `AND id != ${itemId}` : ""}`;
};

/* ---------------------------------------------
   ✅ Create Event or Exam
--------------------------------------------- */
export async function createItem(table, body, userId, res) {
  const start = toSqlDateTime(body.start);
  const end = toSqlDateTime(body.end);

  let campusBatchId = null;
  let isCampusEvent = false; // 🧩 Check if batch or department is "campus"

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
  } /* ---------------------------------------------
     ✅ 1. Venue Conflicts
  --------------------------------------------- */

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
  const vconf = [
    ...vconfEvents,
    ...vconfExams,
  ]; /* ---------------------------------------------
     ✅ 2. Batch/Campus Conflicts
  --------------------------------------------- */

  let bconf = [];
  if (body.batchId || isCampusEvent) {
    const batchIdForQuery = body.batchId ?? 0;

    const [bevents] = await pool.query(
      getBatchConflictsSql("events", isCampusEvent),
      [start, end, batchIdForQuery]
    );
    const [bexams] = await pool.query(
      getBatchConflictsSql("exams", isCampusEvent),
      [start, end, batchIdForQuery]
    );

    bconf = [...bevents, ...bexams];

    if (isCampusEvent) {
      const [allEvents] = await pool.query(
        getAllCampusDayConflictsSql("events"),
        [start, end]
      );
      const [allExams] = await pool.query(
        getAllCampusDayConflictsSql("exams"),
        [start, end]
      );
      bconf.push(...allEvents, ...allExams);
    }
  } /* ---------------------------------------------
     🔒 Apply Conflict Rules
  --------------------------------------------- */

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
  } /* ---------------------------------------------
     ✅ 3. Create Record
  --------------------------------------------- */

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

  return { id: r.insertId, vconflicts: vconf, bconflicts: uniqueBconf };
}

/* ---------------------------------------------
   ✅ List Events/Exams (for Calendar)
--------------------------------------------- */
export async function listItems(table, query = {}) {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.start_utc, e.end_utc,
            d.name AS departmentName,
            b.label AS batchName,
            v.name AS venueName, v.capacity
     FROM ${table} e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN batches b ON e.batch_id = b.id
     LEFT JOIN venues v ON e.venue_id = v.id
     ORDER BY e.start_utc ASC`
  );
  return rows;
}

/*----------------------------------------------
    ✅ Delete Event/Exam
----------------------------------------------*/
export async function deleteItem(table, id) {
  try {
    // Check if record exists first
    const [[existing]] = await pool.query(
      `SELECT id, title FROM ${table} WHERE id=?`,
      [id]
    );
    if (!existing) {
      return { success: false, message: `${table} record not found.` };
    } // DELETE record
    await pool.query(`DELETE FROM ${table} WHERE id=?`, [id]);
    return { success: true, message: `${table} record deleted successfully.` };
  } catch (err) {
    console.error("Error deleting item:", err);
    return { success: false, error: "Internal server error", err };
  }
}

/* ---------------------------------------------
  🆕 Update Event or Exam
--------------------------------------------- */

export async function updateItem(table, id, body, userId, res) {
  try {
    // Ensure the ID is parsed as an integer for comparison
    const itemId = parseInt(id);

    console.log("update Item started for ID:", itemId);

    // Assume toSqlDateTime, pool, overlapSql, getBatchConflictsSql,
    // and getAllCampusDayConflictsSql are correctly defined and cleaned.
    const start = toSqlDateTime(body.start);
    const end = toSqlDateTime(body.end);

    let campusBatchId = null;
    let isCampusEvent = false;

    // 🧩 Campus/Batch check logic (unchanged)
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
    }

    /* ---------------------------------------------
      ✅ 1. Venue Conflicts (Excluding current item)
    --------------------------------------------- */
    const [vconfEvents] = await pool.query(overlapSql("events", itemId), [
      body.venueId,
      end,
      start,
    ]);
    const [vconfExams] = await pool.query(overlapSql("exams", itemId), [
      body.venueId,
      end,
      start,
    ]);
    const vconf = [...vconfEvents, ...vconfExams];
    console.log("88888888888888 (Venue Check Complete)");

    /* ---------------------------------------------
      ✅ 2. Batch/Campus Conflicts (Excluding current item)
    --------------------------------------------- */
    let bconf = [];
    if (body.batchId || isCampusEvent) {
      const batchIdForQuery = body.batchId ?? 0;

      const [bevents] = await pool.query(
        getBatchConflictsSql("events", isCampusEvent, itemId),
        [start, end, batchIdForQuery]
      );
      const [bexams] = await pool.query(
        getBatchConflictsSql("exams", isCampusEvent, itemId),
        [start, end, batchIdForQuery]
      );

      bconf = [...bevents, ...bexams];

      if (isCampusEvent) {
        const [allEvents] = await pool.query(
          getAllCampusDayConflictsSql("events", itemId),
          [start, end]
        );
        const [allExams] = await pool.query(
          getAllCampusDayConflictsSql("exams", itemId),
          [start, end]
        );
        bconf.push(...allEvents, ...allExams);
      }
    }
    console.log("9999999999 (Batch Check Complete)");

    /* ---------------------------------------------
      🔒 Apply Conflict Rules
    --------------------------------------------- */
    if (vconf.length > 0) {
      const [[venue]] = await pool.query(
        "SELECT allow_conflict FROM venues WHERE id=?",
        [body.venueId]
      );

      if (!venue || !venue.allow_conflict) {
        return {
          success: false,
          error:
            "Venue conflict detected. This venue does not allow overlapping events/exams.",
          conflicts: { venue: vconf, batch: bconf },
        };
      }
    }

    const uniqueBconf = bconf.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id)
    );

    if (uniqueBconf.length > 0) {
      return {
        success: false,
        error:
          "Batch conflict detected. Overlapping with the same batch or a Campus-wide schedule.",
        conflicts: { venue: vconf, batch: uniqueBconf },
      };
    }

    /* ---------------------------------------------
      ✅ 3. Update Record (FINAL SCHEMA FIX)
    --------------------------------------------- */
    await pool.query(
      `UPDATE ${table}
      SET title = ?, 
          venue_id = ?, 
          department_id = ?, 
          batch_id = ?, 
          start_utc = ?, 
          end_utc = ?
      WHERE id = ?`,
      [
        body.title,
        body.venueId,
        body.departmentId ?? null,
        body.batchId ?? null,
        start,
        end,
        itemId,
      ]
    );

    console.log("update sucesss 1");

    return { success: true, vconflicts: vconf, bconflicts: uniqueBconf };
  } catch (err) {
    console.error(`Database or Code Error in updateItem (ID: ${id}):`, err);
    return {
      success: false,
      error: "An unexpected internal error occurred during the update.",
      details: err.message || err.code || "See server logs for details.",
    };
  }
}
