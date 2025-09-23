import { Router } from "express";
import { login } from "../controllers/auth.controller.js"; // <-- .js
import { validate } from "../middleware/validate.js"; // <-- .js
import { loginSchema } from "../schemas/auth.schema.js"; // <-- .js

const router = Router();
router.post("/login", validate(loginSchema), login);
export default router;
