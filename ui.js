const install = document.getElementById("install");
const help = document.getElementById("install-help");
const connection = document.getElementById("connection-note");
let installPrompt;
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
