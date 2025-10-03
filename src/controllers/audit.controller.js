import { pool } from "../db.js";

export const AuditController = {
  list: async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, title, type, actor, ref_id, ref_type, created_at 
       FROM audit_logs 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    res.json(rows);
  },
};
