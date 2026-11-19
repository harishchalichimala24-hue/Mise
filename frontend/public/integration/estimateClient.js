/**
 * Reusable in React, browser JavaScript or a backend with fetch.
 * apiBase is an origin or a reverse-proxy prefix, e.g. "" or "/kitchen-ai".
 * Only pass known kitchen state. Handle errors and show the returned warnings.
 */
export async function estimateOrder(request, { apiBase = "", signal } = {}) {
  const response = await fetch(
    apiBase.replace(/\/$/, "") + "/api/v1/estimate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail
          .map((item) => item.loc.slice(1).join(".") + " " + item.msg)
          .join(" · ")
      : typeof detail === "string"
        ? detail
        : "Could not estimate this order. Please try again.";
    throw new Error(message);
  }
  return data;
}
