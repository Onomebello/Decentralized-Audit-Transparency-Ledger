import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ValidationError[];
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationError[] = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        const response: ErrorResponse = {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details,
          },
        };
        return res.status(400).json(response);
      }
      next(err);
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationError[] = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        const response: ErrorResponse = {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid path parameters",
            details,
          },
        };
        return res.status(400).json(response);
      }
      next(err);
    }
  };
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationError[] = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        const response: ErrorResponse = {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details,
          },
        };
        return res.status(400).json(response);
      }
      next(err);
    }
  };
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("Unhandled error:", err.message);
  const response: ErrorResponse = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
  res.status(500).json(response);
}
