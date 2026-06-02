// popup — API 키·언어·토글을 chrome.storage.local 에 저장/로드.
// 키 write 는 여기(popup)에서만; read 는 background(SW)에서만 한다.
const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get(["apiKey", "targetLang", "translationEnabled"]);
  if (s.apiKey) $("apiKey").value = s.apiKey;
  $("targetLang").value = s.targetLang ?? "Korean";
  $("translationEnabled").checked = s.translationEnabled !== false;
}

async function save() {
  await chrome.storage.local.set({
    apiKey: $("apiKey").value.trim(),
    targetLang: $("targetLang").value.trim() || "Korean",
    translationEnabled: $("translationEnabled").checked,
  });
  $("status").textContent = "저장됨 ✓";
  setTimeout(() => ($("status").textContent = ""), 1500);
}

$("save").addEventListener("click", save);
load();
