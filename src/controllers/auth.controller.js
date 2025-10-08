import { pool } from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logAudit } from "../services/audit.service.js";

export async function login(req, res) {
  const { email, password } = req.valid.body;

  try {
    const [[user]] = await pool.query(
      "SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?",
      [email]
    );

    if (!user)
      return res
        .status(401)
        .json({ ok: false, error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res
        .status(401)
        .json({ ok: false, error: "Invalid email or password" });

    const payload = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    // 🔥 log the login event
    await logAudit({
      title: `User "${user.full_name}" logged in`,
      type: "login",
      actor: user.email,
    });

    res.json({ ok: true, user: payload, token });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
