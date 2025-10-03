import { pool } from "../db.js";

export async function listVenues(req, res) {
  const [rows] = await pool.query(
    `SELECT v.id, v.name, v.type, v.capacity, v.allow_conflict,
            v.created_at, v.building_id,
            b.name AS buildingName
     FROM venues v
     LEFT JOIN buildings b ON v.building_id = b.id
     ORDER BY v.name ASC`
  );
  res.json(rows);
}

export async function createVenue(req, res) {
  const {
    name,
    type = null,
    buildingId, // ✅ building reference
    capacity = null,
    allowConflicts = false, // ✅ boolean
  } = req.valid.body;

  try {
    const [r] = await pool.query(
      "INSERT INTO venues (name, type, building_id, capacity, allow_conflict) VALUES (?, ?, ?, ?, ?)",
      [name, type, buildingId, capacity, allowConflicts ? 1 : 0]
    );

    const [[row]] = await pool.query(
      `SELECT v.id, v.name, v.type, v.capacity, v.allow_conflict,
              v.created_at, v.building_id,
              b.name AS buildingName
       FROM venues v
       LEFT JOIN buildings b ON v.building_id = b.id
       WHERE v.id=?`,
      [r.insertId]
    );

    res.status(201).json(row);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Venue name already exists" });
    }
    throw e;
  }
}

export async function updateVenue(req, res) {
  const { id } = req.valid.params;
  const {
    name,
    type = null,
    buildingId,
    capacity = null,
    allowConflicts = false,
  } = req.body;

  await pool.query(
    "UPDATE venues SET name=?, type=?, building_id=?, capacity=?, allow_conflict=? WHERE id=?",
    [name, type, buildingId, capacity, allowConflicts ? 1 : 0, id]
  );

  const [[row]] = await pool.query(
    `SELECT v.id, v.name, v.type, v.capacity, v.allow_conflict,
            v.created_at, v.building_id,
            b.name AS buildingName
     FROM venues v
     LEFT JOIN buildings b ON v.building_id = b.id
     WHERE v.id=?`,
    [id]
  );

  res.json(row);
}

export async function deleteVenue(req, res) {
  const { id } = req.valid.params;

  // check if any event or exam is using this venue
  const [[{ count: eventCount }]] = await pool.query(
    "SELECT COUNT(*) as count FROM events WHERE venue_id=?",
    [id]
  );
  const [[{ count: examCount }]] = await pool.query(
    "SELECT COUNT(*) as count FROM exams WHERE venue_id=?",
    [id]
  );

  if (eventCount > 0 || examCount > 0) {
    return res.status(400).json({
      error: "Cannot delete venue. It is already assigned to events or exams.",
    });
  }

  await pool.query("DELETE FROM venues WHERE id=?", [id]);
  res.json({ ok: true });
}
