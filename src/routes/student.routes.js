import { Router } from "express";
import { StudentController } from "../controllers/student.controller.js";

const router = Router();

router.post("/", StudentController.create);
router.get("/", StudentController.list);
router.get("/:id", StudentController.update);
router.put("/:id", StudentController.delete);

export default router;
