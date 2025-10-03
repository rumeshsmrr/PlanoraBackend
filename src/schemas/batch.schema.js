import { z } from "zod";

export const createBatchSchema = z.object({
  body: z.object({
    label: z.string().min(2, "Batch label is required"), // e.g. "4y 2sem"
  }),
});

export const updateBatchSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, "Batch id must be a number"),
  }),
  body: z.object({
    label: z.string().min(2).optional(),
  }),
});
