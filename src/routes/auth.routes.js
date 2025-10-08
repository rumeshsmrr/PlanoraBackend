import { Router } from "express";
import { login } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { loginSchema } from "../schemas/auth.schema.js";

const router = Router();
router.post("/login", validate(loginSchema), login);
export default router;
