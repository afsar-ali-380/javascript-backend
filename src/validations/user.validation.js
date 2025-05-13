import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 character"),
  email: z.string().email(),
  fullName: z.string().min(2, "FullName must be at least 2 character"),
  password: z.string().min(6, "Password must be at least 2 character"),
});
