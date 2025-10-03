// middleware/validate.js
import { ZodError } from "zod";

export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    params: req.params, // <-- make sure this is passed
    query: req.query,
  });

  if (!parsed.success) {
    const { formErrors, fieldErrors } = parsed.error.flatten();
    return res
      .status(400)
      .json({ ok: false, error: { formErrors, fieldErrors } });
  }

  req.valid = parsed.data; // { body, params, query }
  next();
};
