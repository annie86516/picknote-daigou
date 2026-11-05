import { summarizeBuyers } from "./summary.js";
import { manage, formPayload, setAdminKey, rememberAdmin, hasAdminKey, isAdminRemembered, forgetAdmin } from "./shared.js?v=20261105-2";
const $ = id => document.getElementById(id);
let items = [], state = "all", previewUrl = "", requestId = crypto.randomUUID(), loaded = false;
const media = "/api/items/";
const money = n => n.toLocaleString("zh-TW");
let currentView = ["orders", "add", "settlement"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "orders";
function showView(view) {
  currentView = view;
  for (const name of ["orders", "add", "settlement"]) $(name).hidden = name !== view;
  document.querySelector(".workspace").hidden = view === "settlement";
  document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
  history.replaceState(null, "", location.pathname + location.search + "#" + view);
}
document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => showView(button.dataset.view));
showView(currentView);
const emptyArt = '<svg viewBox="0 0 120 98" fill="none" aria-hidden="true"><ellipse cx="61" cy="83" rx="41" ry="5" fill="#e7e9da" stroke="none"/><g transform="rotate(8 60 50)" stroke="#41523e" stroke-linejoin="round"><rect x="37" y="19" width="48" height="63" rx="4" fill="#c0cba7"/><rect x="32" y="16" width="48" height="63" rx="4" fill="#f6f0d2"/><rect x="37" y="21" width="38" height="52" rx="1" fill="#fffdf2" stroke-width="1.3"/><rect x="44" y="13" width="24" height="9" rx="3" fill="#97ad87"/><path d="m42 36 2 2 4-5m4 3h16m-26 11 2 2 4-5m4 3h13m-23 11 2 2 4-5m4 3h11" stroke-width="1.6"/></g><path d="m91 26 3 6 6 2-6 2-3 6-2-6-6-2 6-2Z" fill="#e8b778" stroke="#65745a" stroke-width="1.3"/><path d="m26 47-7-3m7 11-8 2" stroke="#939f80"/></svg>';
function element(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
let dataRevision = 0;
let activeWrites = 0;
async function api(path, options = {}) {
  const method = options.method || "GET";
  if (method === "GET") return manage(path === "/api/invite" ? "invite" : "list");
  dataRevision += 1;
  activeWrites += 1;
  try {
    const id = path.split("/").pop();
    if (method === "POST") return await manage("add", await formPayload(options.body));
    if (method === "PUT") return await manage("edit", { ...await formPayload(options.body), id });
    if (method === "DELETE") return await manage("delete", { id });
    return await manage("purchase", { ...JSON.parse(options.body), id });
  } finally {
    activeWrites -= 1;
    dataRevision += 1;
  }
}
function renderSummary() {
  const summaries = summarizeBuyers(items);
  $("buyer-totals").replaceChildren();
  $("actual-total").textContent = "NT$ " + money(summaries.reduce((sum, row) => sum + row.total, 0));
  $("summary-empty").hidden = summaries.length > 0;
  for (const summary of summaries) {
    const row = element("tr");
    const buyer = element("td");
    const button = element("button", "buyer-link", summary.name);
    button.onclick = () => {
      $("people").value = summary.name;
      state = "all";
      document.querySelectorAll("[data-state]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.state === "all")));
      render();
      showView("orders");
      $("orders").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    buyer.append(button);
    const total = element("td", "", "NT$ " + money(summary.total));
    if (summary.missing) total.append(element("small", "incomplete", "已填金額小計"));
    row.append(
      buyer,
      element("td", "", summary.purchased + " 筆"),
      element("td", "", summary.pending + " 筆"),
      element("td", summary.missing ? "missing" : "", summary.missing ? summary.missing + " 筆待補金額" : "已填寫完整"),
      total
    );
    $("buyer-totals").append(row);
  }
}
function render() {
  renderSummary();
  $("total").textContent = money(items.length);
  $("pending").textContent = money(items.filter(x => !x.done).length);
  $("sum").textContent = money(items.reduce((n, x) => n + x.amount, 0));
  const selected = items.some(x => x.buyer === $("people").value) ? $("people").value : "";
  $("people").replaceChildren(new Option("所有購買人", ""));
  for (const buyer of [...new Set(items.map(x => x.buyer))].sort((a,b)=>a.localeCompare(b,"zh-Hant"))) $("people").add(new Option(buyer,buyer));
  $("people").value = selected;
  const visible = items.filter(x => (!selected || selected === x.buyer) && (state === "all" || (state === "done") === x.done));
  $("count").textContent = visible.length + " 筆";
  $("rows").replaceChildren();
  for (const x of visible) {
    const row = element("article","row");
    const thumb = element("button","thumb"), img = element("img");
    img.src = x.thumbnail; img.alt = (x.name || x.buyer + "的商品") + "截圖"; img.loading = "lazy";
    thumb.append(img); thumb.setAttribute("aria-label", "放大" + img.alt);
    thumb.onclick = async () => {
      thumb.disabled = true;
      try {
        const result = await manage("image", { id: x.id });
        $("large").src = result.image;
        $("zoom").showModal();
      } catch (error) { $("list-msg").textContent = error.message; }
      finally { thumb.disabled = false; }
    };
    const info = element("div","info");
    info.append(element("strong","",x.name || "商品截圖"), element("span","",x.buyer + " · 預估 NT$ " + money(x.amount)));
    const controls=element("div","row-actions");
    const checked=element("label","purchased"),box=element("input");box.type="checkbox";box.checked=x.done;
    box.setAttribute("aria-label",(x.name || x.buyer+"的商品")+" 已購買");checked.append(box,document.createTextNode("已購買"));
    box.onchange=async()=>{
      box.checked=x.done;
      if(!x.done){openPurchase(x);return;}
      box.disabled=true;
      try{await setPurchased(x,{done:false});}catch(e){$("list-msg").textContent=e.message;box.disabled=false;}
    };
    if(x.done){
      const actual=element("button","actual",x.actualAmount==null?"＋ 補填購買金額":"實付 NT$ "+money(x.actualAmount));
      actual.title="修改實際購買金額";actual.onclick=()=>openPurchase(x);info.append(actual);
    }
    const links=element("div","row-links");const edit=element("button","","修改"),del=element("button","delete","刪除");
    edit.onclick=()=>openEdit(x);del.onclick=()=>openDelete(x);links.append(edit,del);controls.append(checked,links);
    row.append(thumb,info,controls); $("rows").append(row);
  }
  if (!visible.length) {
    const d = element("div","empty"); d.innerHTML=emptyArt;
    d.append(element("strong","",items.length ? "沒有符合條件的代購" : "還沒有代購紀錄"),element("p","",items.length ? "試試其他購買人或進度。" : "加入第一筆商品，開始你的代購手帳。"));
    $("rows").append(d);
  }
}
let loading = false;
async function load() {
  if (loading || activeWrites || !hasAdminKey()) return;
  loading = true;
  const revision = dataRevision;
  try {
    const next = await api("/api/items");
    if (revision !== dataRevision) return;
    items = next;
    loaded = true;
    $("unlock-msg").textContent = "";
    $("list-msg").textContent = "";
    rememberAdmin();
    $("unlock").hidden = true;
    $("top").hidden = false;
    $("admin-nav").hidden = false;
    $("admin-tools").hidden = false;
    $("device-settings").hidden = false;
    $("remember-device").checked = isAdminRemembered();
    render();
  } catch (error) {
    if (!loaded) $("unlock-msg").textContent = error.message;
    else $("list-msg").textContent = error.message;
  } finally { loading = false; }
}
$("unlock-form").onsubmit = async event => {
  event.preventDefault();
  setAdminKey($("admin-key").value);
  const submit = $("unlock-form").querySelector("button");
  submit.disabled = true;
  try {
    await load();
    if (loaded) {
      rememberAdmin($("unlock-remember").checked);
      $("remember-device").checked = isAdminRemembered();
    }
  } finally { submit.disabled = false; }
};
$("remember-device").onchange = () => {
  rememberAdmin($("remember-device").checked);
  $("remember-device").checked = isAdminRemembered();
};
$("sign-out").onclick = () => { forgetAdmin(); location.reload(); };
$("refresh").onclick = async () => {
  $("refresh").disabled = true;
  $("refresh").textContent = "更新中…";
  try { await load(); } finally { $("refresh").disabled = false; $("refresh").textContent = "重新整理"; }
};
document.querySelectorAll("[data-state]").forEach(btn => btn.onclick = () => {
  state = btn.dataset.state; document.querySelectorAll("[data-state]").forEach(el => el.setAttribute("aria-pressed", String(btn === el))); if(loaded) render();
});
$("people").onchange = () => { if(loaded) render(); };
$("close").onclick=()=>$("zoom").close();
$("zoom").onclick=e=>{if(e.target===$("zoom")) $("zoom").close();};
function preview() {
  const f = $("file").files[0];
  URL.revokeObjectURL(previewUrl);
  const error = f && (!["image/png","image/jpeg","image/webp"].includes(f.type) || f.size > 8*1024*1024) ? "請選擇 8 MB 以內的 JPG、PNG 或 WebP 圖片。" : "";
  $("file").setCustomValidity(error); $("form-msg").textContent=error;
  const show = !!f && !error;
  $("preview").hidden=!show; document.querySelector(".replace").hidden=!show; document.querySelector(".drop-text").hidden=show;
  if(show){ previewUrl=URL.createObjectURL(f); $("preview").src=previewUrl; }
}
$("file").onchange=preview;
for (const eventName of ["dragenter","dragover","dragleave","drop"]) $("drop").addEventListener(eventName,e=>{
  $("drop").classList.toggle("over",eventName==="dragover" || eventName==="dragenter");
  if(eventName==="drop") { e.preventDefault(); if(e.dataTransfer.files.length){$("file").files=e.dataTransfer.files;preview();$("form").dispatchEvent(new Event("input"));} }
  if(eventName==="dragover") e.preventDefault();
});
$("form").oninput=()=>{requestId=crypto.randomUUID();$("buyer").setCustomValidity("");};
$("form").onsubmit=async e=>{
  e.preventDefault();
  if (!$("buyer").value.trim()) { $("buyer").setCustomValidity("請填寫購買人姓名。"); $("buyer").reportValidity();return; }
  const data = new FormData();
  for(const key of ["name","buyer","amount"]) data.set(key,$(key).value.trim());
  data.set("id",requestId);data.set("image",$("file").files[0]);
  const controls=[...$("form").elements]; controls.forEach(c=>c.disabled=true); $("submit").textContent="儲存中…";
  try {
    const result = await api("/api/items",{method:"POST",body:data});
    items = [result,...items.filter(x=>x.id!==result.id)]; $("form").reset(); preview(); requestId=crypto.randomUUID();
    $("people").value=""; document.querySelector('[data-state="all"]').click(); render();
    $("form-msg").textContent="已加入代購清單。"; if(!loaded) await load();
  } catch(err) { $("form-msg").textContent=err.message; }
  finally { controls.forEach(c=>c.disabled=false); $("submit").textContent="＋ 加入代購清單"; }
};
$("rows").textContent="正在載入清單…";load();

$("invite").onclick=async()=>{
  $("share-url").value="";$("copy").disabled=true;$("share-msg").textContent="正在取得填單連結…";$("share-dialog").showModal();
  try {const r=await api("/api/invite");$("share-url").value=new URL("buyer.html",location.href).href+"#"+r.code;$("copy").disabled=false;$("share-msg").textContent="";}catch(e){$("share-msg").textContent=e.message;}
};
$("share-close").onclick=()=>$("share-dialog").close();
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("share-url").value);$("share-msg").textContent="已複製填單連結。";}catch{$("share-url").select();$("share-msg").textContent="請複製已選取的連結。";}};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")load();});
setInterval(()=>{if(document.visibilityState==="visible" && !$("submit").disabled)load();},30000);
let editing=null,removing=null;
function openEdit(item){
  editing=item;$("edit-form").reset();
  for(const name of ["name","buyer","amount"])$("edit-"+name).value=item[name];
  $("edit-msg").textContent="";$("edit-dialog").showModal();
}
$("edit-cancel").onclick=()=>$("edit-dialog").close();
$("edit-form").onsubmit=async e=>{
  e.preventDefault();const form=$("edit-form"),target=editing;
  const data=new FormData();for(const name of ["name","buyer","amount"])data.set(name,$("edit-"+name).value.trim());
  data.set("updated",target.updated || target.date);const image=$("edit-image").files[0];
  if(image){if(image.size>8388608){$("edit-msg").textContent="截圖最大為 8 MB。";return;}data.set("image",image);}
  const controls=[...form.elements];controls.forEach(c=>c.disabled=true);
  try {const row=await api(media+target.id,{method:"PUT",body:data});items=items.map(x=>x.id===row.id?row:x);render();$("edit-dialog").close();$("list-msg").textContent="已儲存修改。";}
  catch(err){$("edit-msg").textContent=err.message;}
  finally{controls.forEach(c=>c.disabled=false);}
};
function openDelete(item){removing=item;$("delete-text").textContent="將刪除"+item.buyer+"的「"+(item.name || "商品截圖")+"」和這筆紀錄。";$("delete-msg").textContent="";$("delete-dialog").showModal();$("delete-cancel").focus();}
$("delete-cancel").onclick=()=>$("delete-dialog").close();
$("delete-yes").onclick=async()=>{
  const target=removing;$("delete-yes").disabled=true;
  try {await api(media+target.id,{method:"DELETE"});items=items.filter(x=>x.id!==target.id);render();$("delete-dialog").close();$("list-msg").textContent="已刪除這筆代購。";}
  catch(err){$("delete-msg").textContent=err.message;}
  finally{$("delete-yes").disabled=false;}
};

let paying=null;
function openPurchase(item){
  paying=item;$("paid-item").textContent=item.buyer+"的「"+(item.name || "商品截圖")+"」 · 預估 NT$ "+money(item.amount);
  $("paid-amount").value=item.actualAmount ?? "";$("paid-msg").textContent="";$("paid-save").textContent=item.done?"儲存金額":"確認已購買";
  $("paid-dialog").showModal();$("paid-amount").focus();
}
async function setPurchased(item,values){
  const result=await api(media+item.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(values)});
  items=items.map(x=>x.id===item.id?{...x,...result}:x);render();
}
$("paid-cancel").onclick=()=>$("paid-dialog").close();
$("paid-form").onsubmit=async e=>{
  e.preventDefault();const value=$("paid-amount").value;
  $("paid-save").disabled=true;
  try {await setPurchased(paying,{done:true,actualAmount:value===""?null:Number(value)});$("paid-dialog").close();$("list-msg").textContent="已更新購買紀錄。";}
  catch(err){$("paid-msg").textContent=err.message;}finally{$("paid-save").disabled=false;}
};
