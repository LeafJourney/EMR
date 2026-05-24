import { z } from "zod";

export const patientDemographicsSchema = z.object({
  organizationId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be ISO YYYY-MM-DD"),
  sex: z
    .enum(["male", "female", "other", "unknown"])
    .nullable()
    .optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
});
