import { ZodError } from "zod";

export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    query: req.query,
  });
  if (!parsed.success) {
    const err =
      parsed.error instanceof ZodError
        ? parsed.error.flatten()
        : { formErrors: ["Invalid input"] };
    return res.status(400).json({ ok: false, error: err });
  }
  req.valid = parsed.data;
  next();
};
