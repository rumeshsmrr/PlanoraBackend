// src/services/chat.service.js
import { pool } from "../db.js";
import fetch from "node-fetch";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

/* -------------------------
    Time Cleaning Helper
    (remains the same)
    ------------------------- */
function cleanTime(timeStr) {
  if (!timeStr) return null;
  return timeStr
    .toLowerCase()
    .replace(/(\d{1,2})\.(\d{2})/g, "$1:$2")
    .replace(/am|pm/g, "")
    .trim();
}

/* -------------------------
    Message parsing / validation
    (remains the same)
    ------------------------- */
export function validateMessage(text) {
  const t = String(text).trim();
  const dateMatch = t.match(
    /(\b\d{4}-\d{2}-\d{2}\b)|(\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b)|(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)/i
  );
  const dateStr = dateMatch ? dateMatch[0] : null;
  const timeMatch = t.match(
    /(\b\d{1,2}(?:[:.]\d{2})?(?:am|pm)?\b)\s*(?:-|–|to|—|and)\s*(\d{1,2}(?:[:.]\d{2})?(?:am|pm)?\b)/i
  );
  const timeStart = timeMatch ? cleanTime(timeMatch[1]) : null;
  const timeEnd = timeMatch ? cleanTime(timeMatch[2]) : null;
  const venueMatch = t.match(
    /\b(F\d{3}|BK-\d{3}|hall\s*\w*|auditorium|ground|common area|f\d{3})\b/i
  );
  const venueName = venueMatch ? venueMatch[0] : null;
  const batchMatch = t.match(
    /\b(campus|batch\s*\d+|[0-9]y\s*\d+sem|[0-9]y)\b/i
  );
  const batchName = batchMatch ? batchMatch[0] : null;
  const wantsUpcoming =
    /\b(upcoming|next|soon|today|this week|today's|today)\b/i.test(t);

  return {
    original: text,
    dateStr,
    timeStart,
    timeEnd,
    venueName,
    batchName,
    wantsUpcoming,
  };
}

/* -------------------------
    DB lookups (Core logic for availability checks)
    ------------------------- */
export async function querySchedules(parsed) {
  const params = [];

  // --- Create SQL fragments (Placeholders remain alias-agnostic for now) ---
  const dateFragment = parsed.dateStr ? " AND DATE(start_utc) = ?" : "";
  const timeFragment =
    parsed.timeStart && parsed.timeEnd
      ? " AND TIME(start_utc) < STR_TO_DATE(?, '%H:%i') AND TIME(end_utc) > STR_TO_DATE(?, '%H:%i')"
      : "";

  // The venue and batch fragments MUST use generic placeholders that we will swap later
  const venueFragmentGeneric = parsed.venueName
    ? " AND (__VENUE_NAME_ALIAS__ LIKE ? OR __VENUE_NAME_ALIAS__ = ?)"
    : "";
  const batchFragmentGeneric = parsed.batchName
    ? " AND (__BATCH_LABEL_ALIAS__ = ? OR __BATCH_LABEL_ALIAS__ LIKE ?)"
    : "";

  const upcomingFragment =
    parsed.wantsUpcoming && !parsed.dateStr
      ? " AND start_utc >= ? AND start_utc <= ?"
      : "";

  // 1. Build the FINAL Generic WHERE clause
  let whereGeneric = "WHERE 1=1";
  whereGeneric +=
    dateFragment +
    timeFragment +
    venueFragmentGeneric +
    batchFragmentGeneric +
    upcomingFragment;

  // 2. Build the PARAMETER array (Order must match the appearance of ? in whereGeneric)

  if (parsed.dateStr) {
    const d = new Date(parsed.dateStr);
    if (!Number.isNaN(d.getTime())) {
      params.push(d.toISOString().slice(0, 10));
    }
  }

  if (parsed.timeStart && parsed.timeEnd) {
    params.push(parsed.timeEnd, parsed.timeStart); // Request End Time, Request Start Time
  }

  if (parsed.venueName) {
    params.push(`%${parsed.venueName}%`, parsed.venueName); // Venue params
  }

  if (parsed.batchName) {
    params.push(parsed.batchName, `%${parsed.batchName}%`); // Batch params
  }

  if (parsed.wantsUpcoming && !parsed.dateStr) {
    const now = new Date();
    const then = new Date();
    then.setDate(now.getDate() + 7);
    params.push(
      now.toISOString().slice(0, 19).replace("T", " "),
      then.toISOString().slice(0, 19).replace("T", " ")
    ); // Upcoming date range
  }

  // 3. Create two specific WHERE clauses using find/replace
  const whereEvents = whereGeneric
    .replace(/__VENUE_NAME_ALIAS__/g, "v.name")
    .replace(/__BATCH_LABEL_ALIAS__/g, "b.label");

  const whereExams = whereGeneric
    .replace(/__VENUE_NAME_ALIAS__/g, "v2.name")
    .replace(/__BATCH_LABEL_ALIAS__/g, "b2.label");

  // 4. Execute the SQL
  const sql = `
    SELECT s.id, s.title, s.start_utc, s.end_utc, 
           IFNULL(v.name, '') AS venueName, IFNULL(b.label, '') AS batchName, IFNULL(d.name, '') AS departmentName, 'event' AS type
    FROM events s
    LEFT JOIN venues v ON s.venue_id = v.id
    LEFT JOIN batches b ON s.batch_id = b.id
    LEFT JOIN departments d ON s.department_id = d.id
    ${whereEvents}
    UNION
    SELECT s.id, s.title, s.start_utc, s.end_utc,
           IFNULL(v2.name, '') AS venueName, IFNULL(b2.label, '') AS batchName, IFNULL(d2.name, '') AS departmentName, 'exam' AS type
    FROM exams s
    LEFT JOIN venues v2 ON s.venue_id = v2.id
    LEFT JOIN batches b2 ON s.batch_id = b2.id
    LEFT JOIN departments d2 ON s.department_id = d2.id
    ${whereExams}
    ORDER BY start_utc ASC
    LIMIT 50;
  `;

  // Correctly duplicate the entire parameter array for the UNION.
  const paramsUnion = [...params, ...params];

  const [rows] = await pool.query(sql, paramsUnion);
  return rows;
}
