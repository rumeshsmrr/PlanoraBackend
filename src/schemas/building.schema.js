import { z } from "zod";

export const createBuildingSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Building name is required"),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateBuildingSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    name: z.string().min(2, "Building name is required"),
  }),
  query: z.object({}).optional(),
});

export const idParam = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});
