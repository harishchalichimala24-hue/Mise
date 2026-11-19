export class ShopError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ShopError";
    this.status = status;
  }
}

export async function shopApi(path, { token, body, signal } = {}) {
  let response;
  try {
    response = await fetch("/api/shop" + path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ShopError(
      "We couldn’t reach the kitchen. Check the connection and try again.",
      0,
    );
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg).join(". ")
          : "The request could not be completed. Please try again.";
    throw new ShopError(message, response.status);
  }
  return data;
}
