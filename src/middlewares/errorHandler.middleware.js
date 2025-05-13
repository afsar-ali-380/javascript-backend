import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    // Handle known custom errors
    return res.status(err.statusCode).json({
      success: err.success,
      message: err.message,
      errors: err.errors,
      data: err.data,
    });
  }

  // Handle unknown/unexpected errors
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    errors: [],
  });
};

export { errorHandler };
