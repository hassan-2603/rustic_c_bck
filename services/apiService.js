export function buildApiResponse(data, meta = {}) {
  return {
    ok: true,
    data,
    meta,
  };
}

export function buildApiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}
