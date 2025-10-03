import { pool } from "../db.js";

export async function listBatches(req, res) {
  const [rows] = await pool.query(
    "SELECT id, label FROM batches ORDER BY id ASC"
  );
  res.json(rows);
}

export async function createBatch(req, res) {
  const { label } = req.valid.body;
  try {
    const [r] = await pool.query("INSERT INTO batches (label) VALUES (?)", [
      label,
    ]);
    const [[row]] = await pool.query("SELECT * FROM batches WHERE id=?", [
      r.insertId,
    ]);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Batch already exists" });
    }
    throw e;
  }
}

export async function updateBatch(req, res) {
  const { id } = req.valid.params;
  const { label } = req.valid.body;
  await pool.query("UPDATE batches SET label=? WHERE id=?", [label, id]);
  const [[row]] = await pool.query("SELECT * FROM batches WHERE id=?", [id]);
  res.json(row);
}

export async function deleteBatch(req, res) {
  const { id } = req.valid.params;
  await pool.query("DELETE FROM batches WHERE id=?", [id]);
  res.json({ ok: true });
}
