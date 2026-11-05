import { getAccessKey } from "./shared.js?v=20261105-shared-2";
const install = document.getElementById("install");
const help = document.getElementById("install-help");
const connection = document.getElementById("connection-note");
let installPrompt;
let manifestKey = "", manifestObjectUrl = "";
function configureHomeScreen() {
  const key = getAccessKey();
  if (!key || key === manifestKey) return;
  const base = new URL("./", location.href), start = new URL(base);
  start.hash = new URLSearchParams({ shared: key, view: "orders" }).toString();
  // Keep the invitation on the device, never in the published manifest or repository.
  const manifest = {
    id: base.href, name: "代購手帳", short_name: "代購手帳", lang: "zh-Hant",
    start_url: start.href, scope: base.href, display: "standalone",
    background_color: "#faf5ee", theme_color: "#a64f3f",
    icons: [
      {src: new URL("icon-192.png", base).href, sizes: "192x192", type: "image/png", purpose: "any"},
      {src: new URL("icon-512.png", base).href, sizes: "512x512", type: "image/png", purpose: "any maskable"}
    ]
  };
  const previous = manifestObjectUrl;
  manifestObjectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], {type:"application/manifest+json"}));
  document.querySelector('link[rel="manifest"]').href = manifestObjectUrl;
  manifestKey = key;
  if (previous) URL.revokeObjectURL(previous);
}
window.addEventListener("picknote-access-ready", configureHomeScreen);
function showConnection() {
  if (!connection) return;
  connection.hidden = navigator.onLine;
  connection.textContent = "目前離線，請連線後讀取與儲存代購資料。";
}
window.addEventListener("online", showConnection);
window.addEventListener("offline", showConnection);
showConnection();
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
});
install?.addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else help?.showModal();
});
document.getElementById("install-close")?.addEventListener("click", () => help.close());
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
