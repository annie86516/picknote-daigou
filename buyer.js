import { rpc, formPayload } from "./shared.js?v=20261105-2";
const $=id=>document.getElementById(id);
const code=location.hash.slice(1);
let fileURL="",id=crypto.randomUUID();
const submit=$("submit"),form=$("form"),message=$("form-msg");
function preview(){
  const f=$("file").files[0]; URL.revokeObjectURL(fileURL);
  const issue=f && (!["image/png","image/jpeg","image/webp"].includes(f.type) || f.size>8388608) ? "請選擇 8 MB 以內的 JPG、PNG 或 WebP 圖片。" : "";
  $("file").setCustomValidity(issue);message.textContent=issue;
  const show=!!f && !issue;$("preview").hidden=!show;document.querySelector(".replace").hidden=!show;document.querySelector(".drop-text").hidden=show;
  if(show){fileURL=URL.createObjectURL(f);$("preview").src=fileURL;}
}
$("file").onchange=preview;
$("drop").ondragover=e=>{e.preventDefault();$("drop").classList.add("over");};
$("drop").ondragleave=()=>$("drop").classList.remove("over");
$("drop").ondrop=e=>{e.preventDefault();$("drop").classList.remove("over");if(e.dataTransfer.files.length){$("file").files=e.dataTransfer.files;id=crypto.randomUUID();preview();}};
form.oninput=()=>{id=crypto.randomUUID();$("buyer").setCustomValidity("");};
form.onsubmit=async e=>{
  e.preventDefault();if(!$("buyer").value.trim()){$("buyer").setCustomValidity("請填寫你的姓名或暱稱。");$("buyer").reportValidity();return;}
  const payload=new FormData();for(const key of ["buyer","name","amount"])payload.set(key,$(key).value.trim());
  payload.set("image",$("file").files[0]);payload.set("id",id);
  const controls=[...form.elements];controls.forEach(c=>c.disabled=true);submit.textContent="送出中…";message.textContent="";
  try {
    await rpc("picknote_submit", {p_invite:code, p_data:await formPayload(payload)});
    $("receipt-text").textContent=payload.get("buyer")+"，你的"+(payload.get("name") || "商品")+"已加入代購清單。預估金額 NT$ "+Number(payload.get("amount")).toLocaleString("zh-TW")+"。";
    $("add").hidden=true;$("receipt").hidden=false;$("receipt").focus();form.reset();$("buyer").value=payload.get("buyer");preview();id=crypto.randomUUID();
  } catch(e){message.textContent=e.message==="Failed to fetch"?"連線失敗，請保留此頁並再試一次。":e.message;}
  finally {controls.forEach(c=>c.disabled=false);submit.textContent="送出代購需求";}
};
$("again").onclick=()=>{$("receipt").hidden=true;$("add").hidden=false;$("file").focus();};
if(!code){submit.disabled=true;message.textContent="請使用主揪分享的完整填單連結。";}
