import { Router } from "express";
import { AuditController } from "../controllers/audit.controller.js";

const r = Router();
r.get("/", AuditController.list);

export default r;
