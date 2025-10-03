import { nullable, z } from "zod";

const base = z.object({
  title: z.string().min(2),
  venueId: z.coerce.number().int().positive(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  batchId: z.coerce.number().int().positive().optional().nullable(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const createEventSchema = z.object({ body: base });
export const createExamSchema = z.object({ body: base });

export const byRangeQuery = z.object({
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    vanueId: z.coerce.number().int().optional(),
    batchId: z.coerce.number().int().optional(),
  }),
});
