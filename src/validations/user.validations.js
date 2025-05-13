import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  email: z.string().email(),
  fullName: z.string().min(2, "FullName must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 2 characters"),
});

export const loginSchema = z
  .object({
    username: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string().min(6, "Password must be at least 2 characters"),
  })
  .refine((data) => data.username || data.email, {
    message: "Either username or email is required",
    path: ["username"],
  });
