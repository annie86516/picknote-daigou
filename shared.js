import { config } from "./config.js";

const storageKey = "picknote-admin-" + config.board;
let adminKey = new URLSearchParams(location.hash.slice(1)).get("admin") || sessionStorage.getItem(storageKey) || "";
if (location.hash.startsWith("#admin=")) {
  history.replaceState(null, "", location.pathname + location.search);
}
export function setAdminKey(value) {
  adminKey = value.trim();
}
export function rememberAdmin() {
  sessionStorage.setItem(storageKey, adminKey);
}
export function hasAdminKey() {
  return !!adminKey;
}
export async function rpc(name, args) {
  let response;
  try {
    response = await fetch(config.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { apikey: config.key, "content-type": "application/json" },
      body: JSON.stringify({ p_board: config.board, ...args })
    });
  } catch {
    throw new Error("連線失敗，請稍後再試。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "無法儲存，請稍後再試。");
  return result;
}
export function manage(action, data = {}) {
  return rpc("picknote_manage", { p_admin: adminKey, p_action: action, p_data: data });
}
export async function prepareImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8388608) {
    throw new Error("請選擇 8 MB 以內的 JPG、PNG 或 WebP 圖片。");
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("無法讀取這張圖片，請重新截圖後再試。");
  });
  function draw(maximum, quality) {
    const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }
  try {
    let image = draw(2400, 0.85);
    if (image.length > 2000000) image = draw(1800, 0.72);
    if (image.length > 2000000) throw new Error("圖片內容較大，請裁切後再上傳。");
    return { image, thumbnail: draw(240, 0.75) };
  } finally {
    bitmap.close();
  }
}
export async function formPayload(form) {
  const data = Object.fromEntries(form);
  data.amount = Number(data.amount);
  const file = form.get("image");
  delete data.image;
  if (file) Object.assign(data, await prepareImage(file));
  return data;
}
