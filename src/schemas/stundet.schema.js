import { email, z } from "zod";

const base = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastname: z.string().min(2, "Last name must be at least 2 characters"),
  studentID: z.string().min(2, "Student ID must be at least 2 characters"),
  userId: z.coerce.number().int().positive(),
  departmentId: z.coerce.number().int().positive(),
  batchId: z.coerce.number().int().positive(),
  nic: z
    .string()
    .min(10, "NIC must be at least 10 characters")
    .max(12, "NIC must be at most 12 characters"),
  email: email("Invalid email address"),
});
