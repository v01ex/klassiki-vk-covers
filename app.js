import { probeCoverAPI, safeError } from './probe.js';
const covers = [[1,'На солнечной поляне'],[2,'Больше, чем отряд'],[3,'Летнее небо в лагере'],[6,'Осенним вечером'],[7,'Навстречу приключениям'],[8,'В зелёной траве'],[9,'В кругу своих'],[11,'Лягушка в облаках'],[12,'Облачное настроение'],[13,'Песни на закате'],[14,'Останусь ждать лето'],[17,'Отрядное сердце']];
const $ = id => document.getElementById(id);
const bridge = window.vkBridge;
const appId = Number(new URLSearchParams(location.search).get('vk_app_id'));
let report;
function select(id,title) {
  $('preview').src = `covers/${id}.png`;
  $('preview').alt = title;
  $('coverTitle').textContent = title;
  $('download').href = `covers/${id}.png`;
  $('download').download = `klassiki-${id}.png`;
  for (const card of $('gallery').children) card.setAttribute('aria-pressed', String(card.dataset.id === String(id)));
}
for (const [id,title] of covers) {
  const card = document.createElement('button');
  card.className = 'cover'; card.dataset.id = id; card.setAttribute('aria-label',title); card.setAttribute('aria-pressed', String(id === 1));
  const img = document.createElement('img'); img.src = `covers/${id}.png`; img.alt = ''; img.loading = 'lazy';
  const label = document.createElement('span'); label.textContent = title;
  card.append(img,label); card.addEventListener('click', () => select(id,title)); $('gallery').append(card);
}
async function timed(promise) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('timeout')),20000); })]); }
  finally { clearTimeout(timer); }
}
async function init() {
  if (!bridge || !Number.isSafeInteger(appId) || appId <= 0) {
    $('status').textContent = 'Галерея работает. Для проверки открой приложение внутри ВК: нужен зарегистрированный VK Mini App.'; return;
  }
  try {
    await timed(bridge.send('VKWebAppInit'));
    $('probe').disabled = false;
    $('status').textContent = 'Готово к проверке API под твоим аккаунтом.';
    timed(bridge.send('VKWebAppGetUserInfo')).then(user => {
      $('profileName').textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Мой профиль';
      $('profileSubtitle').textContent = user.city?.title || 'Обложка для личного профиля';
      if (typeof user.photo_200 === 'string' && user.photo_200.startsWith('https://')) {
        const avatar = document.createElement('img'); avatar.src = user.photo_200; avatar.alt = '';
        $('avatar').replaceChildren(avatar);
      }
    }).catch(() => {});
  } catch { $('status').textContent = 'Не удалось подключиться к ВК. Открой приложение через его страницу vk.com/app…'; }
}
$('probe').addEventListener('click', async () => {
  $('probe').disabled = true; $('report').hidden = true;
  $('status').textContent = 'Ожидаем разрешение ВК и ответ API…';
  try {
    report = await timed(probeCoverAPI(bridge,appId));
    $('status').textContent = report.upload_url_received
      ? 'ВК вернул адрес загрузки без group_id. Это ещё не подтверждает поддержку профиля. Скачай результат проверки для следующего шага.'
      : 'Адрес загрузки не получен. Автоматическая установка этим способом пока недоступна.';
  } catch (error) {
    report = safeError(error);
    $('status').textContent = `ВК не разрешил проверку или не ответил${report.error_code !== null ? ` (код ${report.error_code})` : ''}. Можно повторить попытку или скачать обложку.`;
  } finally { $('probe').disabled = false; $('report').hidden = false; }
});
$('report').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='vk-cover-probe.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
function showTab(showGallery) {
  $('catalog').hidden = !showGallery;
  $('help').hidden = showGallery;
  for (const [id,active] of [['galleryTab',showGallery],['helpTab',!showGallery]]) {
    $(id).classList.toggle('active',active); $(id).setAttribute('aria-pressed',String(active));
  }
}
$('galleryTab').addEventListener('click',() => showTab(true));
$('helpTab').addEventListener('click',() => showTab(false));
init();
