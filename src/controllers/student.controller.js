import { pool } from "../db.js";
import bcrypt from "bcryptjs";

export const StudentController = {
  list: async (req, res) => {
    const [rows] = await pool.query(`
      SELECT 
        s.id,
        s.fullName,
        s.firstName,
        s.lastName,
        s.stundetID,
        s.nic,
        s.email,
        d.name AS departmentName,
        b.label AS batchName,
        u.role AS userRole
      FROM stundent s
      LEFT JOIN departments d ON s.department_id = d.id
      LEFT JOIN batches b ON s.batch_id = b.id
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.id ASC;
    `);
    res.json(rows);
  },

  create: async (req, res) => {
    const {
      fullName,
      firstName,
      lastName,
      nic,
      email,
      department_id,
      batch_id,
    } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 🧮 1️⃣ Generate next studentID
      const year = new Date().getFullYear().toString().slice(2);
      const [maxID] = await conn.query(
        "SELECT MAX(id) AS count FROM stundent WHERE YEAR(created_at) = YEAR(CURDATE())"
      );
      const nextNumber = maxID[0].count + 1;
      const studentID = `ST${year}${nextNumber.toString().padStart(5, "0")}`;

      // 🔐 2️⃣ Create user account (role: student)
      const hashedPassword = await bcrypt.hash(nic, 10);
      const [userResult] = await conn.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'student', ?);`,
        [email, hashedPassword, fullName]
      );
      const user_id = userResult.insertId;

      // 🧍‍♂️ 3️⃣ Create student record linked to user
      const [studentResult] = await conn.query(
        `
        INSERT INTO stundent 
          (fullName, firstName, lastName, stundetID, nic, email, department_id, batch_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          fullName,
          firstName,
          lastName,
          studentID,
          nic,
          email,
          department_id || null,
          batch_id || null,
          user_id,
        ]
      );

      await conn.commit();

      res.status(201).json({
        message: "Student created successfully",
        student: {
          id: studentResult.insertId,
          studentID,
          user_id,
          fullName,
          email,
          nic,
        },
      });
    } catch (err) {
      await conn.rollback();
      console.error("❌ Failed to create student:", err);
      res.status(500).json({ error: "Failed to create student" });
    } finally {
      conn.release();
    }
  },

  update: async (req, res) => {
    const { id } = req.params;
    const {
      fullName,
      firstName,
      lastName,
      nic,
      email,
      department_id,
      batch_id,
      user_id,
    } = req.body;
    await pool.query(
      `
      UPDATE stundent 
      SET fullName = ?, firstName = ?, lastName = ?, nic = ?, email = ?, department_id = ?, batch_id = ?, user_id = ?
      WHERE id = ?;
      `,
      [
        fullName,
        firstName,
        lastName,
        nic,
        email,
        department_id,
        batch_id,
        user_id,
        id,
      ]
    );
    const [[row]] = await pool.query("SELECT * FROM stundent WHERE id=?", [id]);
    res.json(row);
  },

  delete: async (req, res) => {
    const { id } = req.params;
    await pool.query("DELETE FROM stundent WHERE id=?", [id]);
    res.json({ ok: true });
  },
};
