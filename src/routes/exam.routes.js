import { Router } from "express";
import { ExamController } from "../controllers/exam.controller.js";
import { validate } from "../middleware/validate.js";
import { createExamSchema, byRangeQuery } from "../schemas/schedule.schema.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

r.get("/", validate(byRangeQuery), ExamController.list);
r.post("/", validate(createExamSchema), ExamController.create);

export default r;
