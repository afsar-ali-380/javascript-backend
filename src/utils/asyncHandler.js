const asyncHandler = (routeHandler) => {
  return (req, res, next) => {
    Promise.resolve(routeHandler(req, res, next)).catch((err) => next(err));
  };
};

/*
const asyncHandler = (routeHandler) => {
  return async function (req, res, next) {
    try {
      await routeHandler(req, res, next);
    } catch (error) {
      res.status(error.code || 500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  };
};
*/

export { asyncHandler };
