import { z } from "zod";

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const EventFilterSchema = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      return z
        .object({
          type: z.string().optional(),
          submitter: z.string().optional(),
          metadata: z.string().optional(),
          startTime: z.number().int().nonnegative().optional(),
          endTime: z.number().int().nonnegative().optional(),
        })
        .parse(parsed);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "filter must be a valid JSON object",
      });
      return z.NEVER;
    }
  });

export const IndexParamSchema = z.object({
  index: z.coerce.number().int().min(0),
});

export const EventTypeParamSchema = z.object({
  type: z.string().min(1).max(32),
});

export const LogEventSchema = z.object({
  submitter: z
    .string()
    .min(56, "submitter must be a valid Stellar address (56 chars)")
    .max(56, "submitter must be a valid Stellar address (56 chars)")
    .regex(/^G[A-Z0-9]{55}$/, "submitter must start with G and contain only uppercase alphanumeric"),
  eventType: z
    .string()
    .min(1, "eventType is required")
    .max(32, "eventType must be at most 32 characters")
    .regex(/^[a-z_]+$/, "eventType must contain only lowercase letters and underscores"),
  metadata: z
    .string()
    .min(1, "metadata is required")
    .max(1024, "metadata must be at most 1024 characters")
    .regex(/^[0-9a-f]*$/i, "metadata must be a hex string"),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type EventFilterInput = z.infer<typeof EventFilterSchema>;
export type LogEventInput = z.infer<typeof LogEventSchema>;
