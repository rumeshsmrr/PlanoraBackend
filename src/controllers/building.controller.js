import { pool } from "../db.js";

export const BuildingController = {
  list: async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, name, created_at FROM buildings ORDER BY name ASC"
    );
    res.json(rows);
  },

  create: async (req, res) => {
    const { name } = req.valid.body;
    try {
      const [r] = await pool.query("INSERT INTO buildings(name) VALUES (?)", [
        name,
      ]);
      const [[row]] = await pool.query("SELECT * FROM buildings WHERE id=?", [
        r.insertId,
      ]);
      res.status(201).json(row);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY")
        return res.status(409).json({ error: "Building name already exists" });
      throw e;
    }
  },

  update: async (req, res) => {
    const { id } = req.valid.params;
    const { name } = req.body;
    await pool.query("UPDATE buildings SET name=? WHERE id=?", [name, id]);
    const [[row]] = await pool.query("SELECT * FROM buildings WHERE id=?", [
      id,
    ]);
    res.json(row);
  },

  delete: async (req, res) => {
    const { id } = req.valid.params;
    await pool.query("DELETE FROM buildings WHERE id=?", [id]);
    res.json({ ok: true });
  },
};
