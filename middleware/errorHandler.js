export function errorHandler(err, req, res, next) {
  console.error("❌ API error:", err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = err.message || "Internal server error";

  res.status(status).json({
    ok: false,
    error: message,
  });
}
