export function errorHandler(err, req, res, next) {
  console.error(err);

  let status = Number(err?.status || 500);
  if (!Number.isFinite(status) || status < 100 || status > 599) status = 500;

  const message = err?.message || "Server error";

  const payload = { message };
  if (err?.code) payload.code = String(err.code);

  return res.status(status).json(payload);
}