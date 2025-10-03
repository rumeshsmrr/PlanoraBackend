import { pool } from "../db.js";

export async function logAudit({
  title,
  type = "other",
  actor,
  refId,
  refType,
}) {
  await pool.query(
    `INSERT INTO audit_logs (title, type, actor, ref_id, ref_type) 
     VALUES (?, ?, ?, ?, ?)`,
    [title, type, actor ?? null, refId ?? null, refType ?? null]
  );
}
