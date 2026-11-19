export async function api(path, data) {
  const response = await fetch(
    "/api" + path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = value?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((v) => v.loc.slice(1).join(".") + " " + v.msg)
              .join(" · ")
          : "Request failed (" + response.status + ")",
    );
  }
  return value;
}
