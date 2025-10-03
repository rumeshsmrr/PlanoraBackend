import { z } from "zod";

export const createVenueSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    type: z.string().optional().nullable(),
    buildingId: z.coerce.number().int().positive(), // ✅ use buildingId not building
    capacity: z.coerce.number().int().positive().optional().nullable(),
    allowConflicts: z.boolean().optional().default(false), // ✅ allow conflict field
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const idParam = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});
