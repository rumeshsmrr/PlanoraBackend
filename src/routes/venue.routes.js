import { Router } from "express";
import {
  listVenues,
  createVenue,
  updateVenue,
  deleteVenue,
} from "../controllers/venue.controller.js";
import { validate } from "../middleware/validate.js";
import { createVenueSchema, idParam } from "../schemas/venue.schema.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

r.get("/", listVenues);
// r.post("/", requireAuth, validate(createVenueSchema), createVenue);
r.post("/", validate(createVenueSchema), createVenue);
r.put("/:id", validate(idParam), updateVenue);
r.delete("/:id", validate(idParam), deleteVenue);

export default r;
