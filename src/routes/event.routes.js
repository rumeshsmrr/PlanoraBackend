import { Router } from "express";
import { EventController } from "../controllers/event.controller.js";
import { validate } from "../middleware/validate.js";
import { createEventSchema, byRangeQuery } from "../schemas/schedule.schema.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

r.get("/", validate(byRangeQuery), EventController.list);
r.post("/", validate(createEventSchema), EventController.create);
r.delete("/:id", EventController.delete);

export default r;
