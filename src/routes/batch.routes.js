import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createBatchSchema,
  updateBatchSchema,
} from "../schemas/batch.schema.js";
import {
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
} from "../controllers/batch.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", listBatches);
router.post("/", requireAuth, validate(createBatchSchema), createBatch);
router.put("/:id", requireAuth, validate(updateBatchSchema), updateBatch);
router.delete("/:id", requireAuth, validate(updateBatchSchema), deleteBatch);

export default router;
