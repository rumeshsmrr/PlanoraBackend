import { Router } from "express";
import { BuildingController } from "../controllers/building.controller.js";
import { validate } from "../middleware/validate.js";
import {
  createBuildingSchema,
  updateBuildingSchema,
  idParam,
} from "../schemas/building.schema.js";

const router = Router();

// List all buildings
router.get("/", BuildingController.list);

// Create new building
router.post("/", validate(createBuildingSchema), BuildingController.create);

// Update building
router.put("/:id", validate(updateBuildingSchema), BuildingController.update);

// Delete building
router.delete("/:id", validate(idParam), BuildingController.delete);

export default router;
