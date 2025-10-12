// src/services/chat.service.js
import { pool } from "../db.js";

// Timezone offset for IST (UTC + 5 hours 30 minutes) in milliseconds
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts a UTC timestamp (which might be a Date object from the DB)
 * to a local IST string (YYYY-MM-DD HH:MM AM/PM).
 * @param {string | Date} utcTimestamp - The UTC timestamp/Date from the database.
 * @returns {string} Local time string (e.g., '2025-10-24 10:00 AM').
 */
function toLocalTimeString(utcTimestamp) {
  if (!utcTimestamp) return "";

  let date;

  // FIX: Check if the input is already a Date object (common with mysql2)
  if (utcTimestamp instanceof Date) {
    // If it's a Date object, use it directly.
    date = utcTimestamp;
  } else {
    // If it's a string, convert it to a Date object, ensuring it's treated as UTC.
    // We ensure a consistent format and append 'Z' (Zulu/UTC) for accurate parsing.
    const utcString = String(utcTimestamp).replace(" ", "T").slice(0, 19) + "Z";
    date = new Date(utcString);
  }

  if (isNaN(date.getTime())) {
    console.error("Invalid date object encountered:", utcTimestamp);
    return "Invalid Time";
  }

  // Apply the IST offset to get the local time components
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);

  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");

  let hours = istTime.getUTCHours();
  const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // The hour '0' should be '12'

  return `${year}-${month}-${day} ${String(hours).padStart(
    2,
    "0"
  )}:${minutes} ${ampm}`;
}

/**
 * Fetches all relevant schedules from the DB (future + recent) and converts times to local IST.
 * This function no longer attempts SQL filtering.
 * @returns {Array<Object>} List of schedules with local time fields.
 */
export async function queryAllSchedules() {
  // Fetch events/exams from the last 2 days up to 30 days in the future
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + 30);
  const past = new Date();
  past.setDate(now.getDate() - 2);

  const params = [
    past.toISOString().replace("T", " ").slice(0, 19),
    future.toISOString().replace("T", " ").slice(0, 19),
  ];

  const sql = `
        SELECT s.id, s.title, s.start_utc, s.end_utc, 
               IFNULL(v.name, '') AS venueName, IFNULL(b.label, '') AS batchName, 'event' AS type
        FROM events s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN batches b ON s.batch_id = b.id
        WHERE s.start_utc >= ? AND s.start_utc <= ?
        UNION
        SELECT s.id, s.title, s.start_utc, s.end_utc,
               IFNULL(v2.name, '') AS venueName, IFNULL(b2.label, '') AS batchName, 'exam' AS type
        FROM exams s
        LEFT JOIN venues v2 ON s.venue_id = v2.id
        LEFT JOIN batches b2 ON s.batch_id = b2.id
        WHERE s.start_utc >= ? AND s.start_utc <= ?
        ORDER BY start_utc ASC;
    `;

  // Duplicate params for the UNION query: [past, future, past, future]
  const [rows] = await pool.query(sql, [...params, ...params]);

  // Convert UTC times to local IST strings
  const localSchedules = rows.map((schedule) => ({
    id: schedule.id,
    title: schedule.title,
    type: schedule.type,
    venueName: schedule.venueName,
    batchName: schedule.batchName,
    local_start: toLocalTimeString(schedule.start_utc),
    local_end: toLocalTimeString(schedule.end_utc),
  }));

  return localSchedules;
}

/* -------------------------
    Message parsing / validation (For extracting user filters)
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
  const timeStart = timeMatch ? timeMatch[1].trim() : null;
  const timeEnd = timeMatch ? timeMatch[2].trim() : null;

  const venueMatch = t.match(
    /\b(F\d{3}|BK-\d{3}|hall\s*\w*|auditorium|ground|common area|f\d{3})\b/i
  );
  const venueName = venueMatch ? venueMatch[0] : null;
  const batchMatch = t.match(
    /\b(campus|batch\s*\d+|[0-9]y\s*\d+sem|[0-9]y)\b/i
  );
  const batchName = batchMatch ? batchMatch[0] : null;

  return {
    original: text,
    dateStr,
    timeStart,
    timeEnd,
    venueName,
    batchName,
  };
}
