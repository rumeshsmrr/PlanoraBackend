import { Router } from "express";
import auth from "./auth.routes.js"; // <-- .js
import { requireAuth } from "../middleware/auth.js"; // <-- .js

const api = Router();

api.use("/auth", auth);

api.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default api;
