import { pool } from "../db.js";

export async function listDepartments(req, res) {
  const [rows] = await pool.query(
    "SELECT * FROM departments ORDER BY name ASC"
  );
  res.json(rows);
}

export async function createDepartment(req, res) {
  const { name } = req.valid.body;
  try {
    const [r] = await pool.query("INSERT INTO departments(name) VALUES (?)", [
      name,
    ]);
    const [[row]] = await pool.query("SELECT * FROM departments WHERE id=?", [
      r.insertId,
    ]);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Department already exists" });
    throw e;
  }
}

export async function updateDepartment(req, res) {
  const { id } = req.valid.params;
  const { name } = req.valid.body;
  await pool.query("UPDATE departments SET name=? WHERE id=?", [name, id]);
  const [[row]] = await pool.query("SELECT * FROM departments WHERE id=?", [
    id,
  ]);
  res.json(row);
}

export async function deleteDepartment(req, res) {
  const { id } = req.valid.params;
  await pool.query("DELETE FROM departments WHERE id=?", [id]);
  res.json({ ok: true });
}
