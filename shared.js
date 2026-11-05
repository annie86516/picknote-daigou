import { config } from "./config.js?v=20261105-shared-2";
const storageKey = "picknote-shared-" + config.board;
const entry = new URLSearchParams(location.hash.slice(1));
function storedAccess() { try { return localStorage.getItem(storageKey) || ""; } catch { return ""; } }
const legacyInvite = /^[A-Za-z0-9_-]{32,100}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : "";
const adminKey = entry.get("shared") || entry.get("admin") || legacyInvite || storedAccess();
export function hasAdminKey() { return !!adminKey; }
export function getAccessKey() { return adminKey; }
export function rememberShared() {
  try { localStorage.setItem(storageKey, adminKey); } catch {}
  window.dispatchEvent(new Event("picknote-access-ready"));
}
export function updateViewUrl(view) {
  const fragment = adminKey ? new URLSearchParams({shared:adminKey,view}).toString() : view;
  history.replaceState(null,"",location.pathname + location.search + "#" + fragment);
}
export async function rpc(name, args) {
  if (!navigator.onLine) throw new Error("目前沒有網路，請連線後再試。填寫內容會保留在此頁。");
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    response = await fetch(config.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { apikey: config.key, "content-type": "application/json" },
      body: JSON.stringify({ p_board: config.board, ...args }),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error.name === "AbortError" ? "連線逾時，請確認網路後重試。填寫內容尚未送出確認。" : "無法連上資料庫，請稍後重試，或切換 Wi-Fi／行動網路。");
  } finally { clearTimeout(timer); }
  const result = await response.json().catch(() => { throw new Error("伺服器暫時無法回應，請稍後再試。"); });
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
