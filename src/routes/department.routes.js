import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../schemas/department.schema.js";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/department.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", listDepartments);
router.post(
  "/",
  requireAuth,
  validate(createDepartmentSchema),
  createDepartment
);
router.put(
  "/:id",
  requireAuth,
  validate(updateDepartmentSchema),
  updateDepartment
);
router.delete(
  "/:id",
  requireAuth,
  validate(updateDepartmentSchema),
  deleteDepartment
);

export default router;
