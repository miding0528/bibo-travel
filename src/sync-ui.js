/* 同步相關的畫面：加入行程視窗、分帳設定視窗裡的「行程」區塊。
   只重用原本就有的元件（openDrawer / closeDrawer、分帳設定視窗的輸入框與按鈕樣式、showToast），沒有新設計。 */
import { friendlyError } from './sync.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var INPUT_CLS = 'w-full bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-md text-body-md text-on-surface focus:outline-none';
var PRIMARY_BTN = 'w-full py-2.5 rounded-full bg-primary-container text-on-primary font-label-lg text-label-lg font-bold shadow-sm';
var SECONDARY_BTN = 'w-full py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-bold shadow-sm flex items-center justify-center gap-1.5';

export function createSyncUI(h) {
  /* h: { openDrawer, closeDrawer, lockDrawer, showToast, twoKeyConfirm, sync } */

  function joinDrawerHTML(prefill) {
    prefill = prefill || {};
    return ''
      + '<div class="flex items-center justify-between w-full">'
      + '<div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: \'FILL\' 1;">luggage</span><h2 class="font-headline-lg text-headline-lg text-on-surface font-black">加入行程</h2></div>'
      + '</div>'
      + '<p class="font-body-md text-body-md text-on-surface-variant">輸入行程代碼和暱稱，兩支手機就會即時同步。</p>'
      + '<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">行程代碼</span><input type="text" id="jn-code" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="BIBO-XXXX-XX" class="' + INPUT_CLS + '" value="' + esc(prefill.code) + '"></div>'
      + '<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">暱稱</span><input type="text" id="jn-nick" autocomplete="off" maxlength="40" placeholder="例如 Lena" class="' + INPUT_CLS + '" value="' + esc(prefill.nick) + '"></div>'
      + '<div id="jn-err" class="text-error font-label-sm text-label-sm px-1 hidden"></div>'
      + '<button class="' + PRIMARY_BTN + '" id="jn-submit" type="button">加入</button>';
  }

  function showJoin(prefill) {
    h.lockDrawer(false);
    h.openDrawer(joinDrawerHTML(prefill), function () {
      h.lockDrawer(true);
      var codeEl = document.getElementById('jn-code');
      var nickEl = document.getElementById('jn-nick');
      var errEl = document.getElementById('jn-err');
      var btn = document.getElementById('jn-submit');
      var busy = false;
      function showErr(t) { errEl.textContent = t; errEl.classList.remove('hidden'); }
      function submit() {
        if (busy) return;
        var code = codeEl.value.trim();
        var nick = nickEl.value.trim();
        errEl.classList.add('hidden');
        if (!code) { showErr('請輸入行程代碼'); return; }
        if (!nick) { showErr('請輸入暱稱'); return; }
        busy = true; btn.textContent = '加入中...'; btn.disabled = true;
        h.sync.join(code, nick).then(function () {
          h.lockDrawer(false);
          h.closeDrawer();
          var t = h.sync.getTrip();
          h.showToast('已加入「' + ((t && t.name) || '行程') + '」');
        }, function (e) {
          var fe = friendlyError(e);
          /* 已加入但同步還沒抓完（例如剛好斷線）：關掉視窗，之後會自動補抓 */
          if (h.sync.isJoined()) {
            h.lockDrawer(false); h.closeDrawer();
            h.showToast('已加入，等網路恢復後會自動同步');
            return;
          }
          showErr(fe.text);
          if (fe.kind === 'anon_disabled') h.showToast(fe.text);
          busy = false; btn.textContent = '加入'; btn.disabled = false;
        });
      }
      btn.addEventListener('click', submit);
      nickEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') submit(); });
      codeEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') nickEl.focus(); });
    });
  }

  /* 分帳設定視窗內的「行程」區塊（放在原本的按鈕區塊上方）；未加入時不顯示 */
  function settingsSectionHTML() {
    var t = h.sync.getTrip();
    if (!t) return '';
    var members = (t.members && t.members.length) ? t.members.map(esc).join('、') : esc(t.nick || '');
    return ''
      + '<div class="pt-space-sm border-t border-outline-variant/40 space-y-space-sm">'
      + '<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">行程代碼</span>'
      + '<div class="flex items-center gap-space-xs"><div class="flex-1 min-w-0 bg-surface-container-lowest rounded-xl p-space-sm shadow-sm font-body-lg text-body-lg text-on-surface font-bold truncate" id="ss-trip-code">' + esc(t.code) + '</div>'
      + '<button class="shrink-0 px-3 py-2 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-bold shadow-sm flex items-center gap-1" id="ss-trip-copy" type="button"><span class="material-symbols-outlined text-[18px]">content_copy</span><span>複製</span></button></div></div>'
      + '<div class="space-y-space-xs"><span class="font-label-md text-label-md text-on-surface font-bold">成員</span><div class="font-body-md text-body-md text-on-surface-variant" id="ss-trip-members">' + members + '</div></div>'
      + '<div id="ss-leave-wrap"><button class="' + SECONDARY_BTN + '" id="ss-leave" type="button"><span class="material-symbols-outlined text-[18px]">restart_alt</span><span>離開行程</span></button></div>'
      + '</div>';
  }

  function bindSettingsSection() {
    var t = h.sync.getTrip();
    if (!t) return;
    var copyBtn = document.getElementById('ss-trip-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var text = t.code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { h.showToast('已複製行程代碼'); }, function () { h.showToast('複製失敗，請手動選取代碼'); });
      } else { h.showToast('複製失敗，請手動選取代碼'); }
    });
    var leaveBtn = document.getElementById('ss-leave');
    if (leaveBtn) leaveBtn.addEventListener('click', function () {
      h.twoKeyConfirm('ss-leave-wrap', '確定要離開這個行程？', function () {
        h.sync.leave();
        h.closeDrawer();
        showJoin();
      });
    });
    /* 背景更新成員名單 */
    h.sync.refreshTrip().then(function (nt) {
      var el = document.getElementById('ss-trip-members');
      if (el && nt && nt.members && nt.members.length) el.textContent = nt.members.join('、');
    });
  }

  return { showJoin: showJoin, settingsSectionHTML: settingsSectionHTML, bindSettingsSection: bindSettingsSection };
}
