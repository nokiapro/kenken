let config = { username: '', repo: '', token: '' };
    let selectedFiles = [], currentPath = '', allFiles = [];
    let selectedPaths = new Set(), favorites = new Set();
    let viewMode = 'list', showOnlyStars = false;
    const PAGE_SIZE = 5;
    let currentPage = 1;
    let filteredFilesCache = [];
    let plyrInstance = null, configCollapsed = false, promptResolve = null;
    let playlist = [], playlistIndex = 0, shuffleMode = false, repeatMode = 0, shuffleOrder = [];
    // repeatMode: 0 = off, 1 = lặp list, 2 = lặp 1 bài
    let sleepTimer = null, sleepEndsAt = 0;
    let audioEl = null; // current HTMLAudioElement for mini player
    let isPlaying = false;

    const $ = id => document.getElementById(id);

    // ===== PASSWORD LOCK =====
    function hashPin(pw) {
      let h = 0;
      for (let i = 0; i < pw.length; i++) h = ((h << 5) - h) + pw.charCodeAt(i) | 0;
      return String(h);
    }
    function checkLock() {
      const hash = localStorage.getItem('gh-app-pass');
      if (!hash) return true;
      if (sessionStorage.getItem('gh-unlocked') === '1') return true;
      $('lock-screen').classList.remove('hidden');
      setTimeout(() => focusPin(), 80);
      return false;
    }
    let pinLen = parseInt(localStorage.getItem('gh-app-pass-len') || '6', 10);
    if (pinLen !== 6 && pinLen !== 8) pinLen = 6;

    function getPinLen() { return pinLen; }

    function setPinLen(n, rebuild) {
      pinLen = (n === 8) ? 8 : 6;
      // Update UI toggles
      document.querySelectorAll('#pin-len-toggle .pin-len-btn, #cfg-pin-len .pin-len-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.len, 10) === pinLen);
      });
      const hint = $('pin-hint');
      if (hint) hint.textContent = 'Nhập mã PIN ' + pinLen + ' số';
      const cfgHint = $('pin-cfg-hint');
      if (cfgHint) cfgHint.textContent = 'Nhập đúng ' + pinLen + ' chữ số. Ai mở link phải nhập PIN này';
      const appPw = $('app-password');
      if (appPw) {
        appPw.maxLength = pinLen;
        appPw.placeholder = 'VD: ' + (pinLen === 6 ? '123456' : '12345678') + ' — trống = không khóa';
      }
      const pinHidden = $('pin-hidden');
      if (pinHidden) pinHidden.maxLength = pinLen;
      if (rebuild !== false) {
        buildPinBoxes();
        clearPin();
      }
    }

    function buildPinBoxes() {
      const wrap = $('pin-boxes');
      if (!wrap) return;
      let html = '';
      for (let i = 0; i < pinLen; i++) {
        html += '<div class="pin-box empty' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">–</div>';
      }
      wrap.innerHTML = html;
      wrap.classList.remove('success-merge');
    }

    function setAppPassword(pw) {
      if (!pw) {
        localStorage.removeItem('gh-app-pass');
        localStorage.removeItem('gh-app-pass-len');
        return;
      }
      const digits = String(pw).replace(/\D/g, '').slice(0, pinLen);
      if (digits.length !== pinLen) {
        showStatus('PIN phải đúng ' + pinLen + ' chữ số', 'error');
        return;
      }
      localStorage.setItem('gh-app-pass', hashPin(digits));
      localStorage.setItem('gh-app-pass-len', String(digits.length));
    }

    function renderPinBoxes(val) {
      const boxes = document.querySelectorAll('#pin-boxes .pin-box');
      const len = getPinLen();
      boxes.forEach((box, i) => {
        box.classList.remove('active', 'filled', 'empty', 'error');
        if (i < val.length) {
          box.textContent = val[i];
          box.classList.add('filled');
        } else {
          box.textContent = '–';
          box.classList.add('empty');
        }
        if (i === val.length && val.length < len) box.classList.add('active');
        if (val.length === len && i === len - 1) box.classList.add('active');
      });
    }
    function focusPin() {
      const inp = $('pin-hidden');
      if (inp) { inp.focus(); inp.click(); }
    }
    function clearPin() {
      const inp = $('pin-hidden');
      if (inp) inp.value = '';
      renderPinBoxes('');
    }
    function playPinSuccessThenUnlock() {
      const wrap = $('pin-boxes');
      const boxes = wrap ? Array.from(wrap.querySelectorAll('.pin-box')) : [];
      if (!wrap || !boxes.length) {
        $('lock-screen').classList.add('hidden');
        startApp();
        return;
      }
      $('lock-error').style.display = 'none';
      wrap.classList.add('success-merge');

      // Tính tâm của hàng ô → mỗi ô trượt về giữa
      const wrapRect = wrap.getBoundingClientRect();
      const centerX = wrapRect.left + wrapRect.width / 2;
      boxes.forEach((b) => {
        const r = b.getBoundingClientRect();
        const boxCenter = r.left + r.width / 2;
        const dx = centerX - boxCenter;
        b.style.transform = 'translateX(' + dx + 'px) scale(0.35)';
        b.classList.add('pin-collapsing');
      });

      // Ô tích xuất hiện ở giữa sau khi các ô thu về
      let check = wrap.querySelector('.pin-success-center');
      if (!check) {
        check = document.createElement('div');
        check.className = 'pin-success-center';
        check.innerHTML = '<i class="fas fa-check"></i>';
        wrap.appendChild(check);
      }
      // force reflow rồi show
      void check.offsetWidth;
      setTimeout(() => check.classList.add('show'), 180);

      setTimeout(() => {
        $('lock-screen').classList.add('hidden');
        wrap.classList.remove('success-merge');
        if (check && check.parentNode) check.parentNode.removeChild(check);
        buildPinBoxes();
        clearPin();
        startApp();
      }, 900);
    }
    function tryUnlock(pw, forceFail) {
      const len = getPinLen();
      if (!pw || pw.length < len) return false;
      if (hashPin(pw) === localStorage.getItem('gh-app-pass')) {
        sessionStorage.setItem('gh-unlocked', '1');
        playPinSuccessThenUnlock();
        return true;
      }
      if (forceFail || pw.length >= len) {
        $('lock-error').style.display = 'block';
        document.querySelectorAll('#pin-boxes .pin-box').forEach(b => b.classList.add('error'));
        setTimeout(() => {
          clearPin();
          $('lock-error').style.display = 'none';
          focusPin();
        }, 500);
      }
      return false;
    }
    // PIN input handlers
    (function initPin() {
      const inp = $('pin-hidden');
      if (!inp) return;
      // Load stored length if password exists
      const storedLen = parseInt(localStorage.getItem('gh-app-pass-len') || '0', 10);
      if (storedLen === 6 || storedLen === 8) pinLen = storedLen;
      setPinLen(pinLen, true);

      // Lock screen length toggle
      document.querySelectorAll('#pin-len-toggle .pin-len-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setPinLen(parseInt(btn.dataset.len, 10), true);
          focusPin();
        });
      });
      // Config length toggle
      document.querySelectorAll('#cfg-pin-len .pin-len-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setPinLen(parseInt(btn.dataset.len, 10), false);
        });
      });

      const boxes = $('pin-boxes');
      if (boxes) boxes.addEventListener('click', focusPin);
      inp.addEventListener('input', () => {
        const len = getPinLen();
        let v = inp.value.replace(/\D/g, '').slice(0, len);
        inp.value = v;
        renderPinBoxes(v);
        if (v.length >= len) tryUnlock(v, true);
      });
      inp.addEventListener('keydown', (e) => {
        const len = getPinLen();
        if (e.key === 'Backspace') {
          setTimeout(() => renderPinBoxes(inp.value.replace(/\D/g, '').slice(0, len)), 0);
        }
        if (e.key === 'Enter') {
          const v = inp.value.replace(/\D/g, '');
          if (v.length >= len) tryUnlock(v, true);
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !$('lock-screen').classList.contains('hidden')) focusPin();
      });
    })();

    // Nút hiện/ẩn mật khẩu (màu theo theme)
    document.querySelectorAll('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        const icon = btn.querySelector('i');
        if (icon) icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
      });
    });

    // ===== THEME (19 light → dark → neon → minimal → retro) =====
    const THEMES = [
      { id: 'light', icon: 'fas fa-sun', label: 'Sáng' },
      { id: 'dark', icon: 'fas fa-moon', label: 'Tối' },
      { id: 'neon', icon: 'fas fa-bolt', label: 'Neon' },
      { id: 'minimal', icon: 'fas fa-circle', label: 'Minimal' },
      { id: 'retro', icon: 'fas fa-compact-disc', label: 'Retro' }
    ];
    function applyTheme(id) {
      const t = THEMES.find(x => x.id === id) || THEMES[0];
      document.documentElement.setAttribute('data-theme', t.id === 'light' ? 'light' : t.id);
      if (t.id === 'light') document.documentElement.removeAttribute('data-theme');
      // light uses :root without attribute - set empty or light
      if (t.id === 'light') document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('gh-theme', t.id);
      const icon = $('theme-icon');
      if (icon) icon.className = t.icon;
      if ($('theme-btn')) $('theme-btn').title = 'Theme: ' + t.label + ' (bấm để đổi)';
    }
    function cycleTheme() {
      const cur = localStorage.getItem('gh-theme') || 'light';
      const i = Math.max(0, THEMES.findIndex(t => t.id === cur));
      const next = THEMES[(i + 1) % THEMES.length];
      applyTheme(next.id);
      showStatus('Theme: ' + next.label, 'info');
    }
    function initTheme() {
      applyTheme(localStorage.getItem('gh-theme') || 'light');
    }
    $('theme-btn').addEventListener('click', cycleTheme);
    initTheme();

    // ===== QR TẢI FILE =====
    function showQr(url, name) {
      if (!url) { showStatus('Không có link tải', 'error'); return; }
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=' + encodeURIComponent(url);
      $('qr-img').src = qrUrl;
      $('qr-name').textContent = name || 'File';
      const open = $('qr-open');
      open.href = url;
      $('qr-modal').classList.add('show');
    }
    function closeQr() { $('qr-modal').classList.remove('show'); }
    $('qr-close').onclick = closeQr;
    $('qr-modal').addEventListener('click', e => { if (e.target.id === 'qr-modal') closeQr(); });

    // ===== PHÍM TẮT =====
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    }
    document.addEventListener('keydown', e => {
      if (isTypingTarget(e.target)) return;
      // Don't hijack when modals for prompt are focused oddly - still ok
      const key = e.key;
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        $('shortcut-hint').classList.toggle('show');
        return;
      }
      if (key === 'Escape') {
        closeQr();
        if ($('shortcut-hint')) $('shortcut-hint').classList.remove('show');
        return;
      }
      if (key === ' ' || key === 'Spacebar') {
        if (audioEl) {
          e.preventDefault();
          if (audioEl.paused) { audioEl.play(); isPlaying = true; }
          else { audioEl.pause(); isPlaying = false; }
          updateMiniUI();
        }
        return;
      }
      if (key === 'ArrowRight' && audioEl) {
        e.preventDefault();
        audioEl.currentTime = Math.min((audioEl.duration || 0), audioEl.currentTime + 5);
        updateMiniUI();
        return;
      }
      if (key === 'ArrowLeft' && audioEl) {
        e.preventDefault();
        audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
        updateMiniUI();
        return;
      }
      if (key === 'n' || key === 'N') {
        if (playlist.length) { e.preventDefault(); playNext(); }
        return;
      }
      if (key === 'p' || key === 'P') {
        if (playlist.length) { e.preventDefault(); playPrev(); }
        return;
      }
      if (key === 's' || key === 'S') {
        e.preventDefault();
        if ($('btn-sync')) $('btn-sync').click();
        return;
      }
      if (key === 'r' || key === 'R') {
        e.preventDefault();
        if ($('btn-refresh')) $('btn-refresh').click();
        return;
      }
      if (key === 't' || key === 'T') {
        e.preventDefault();
        cycleTheme();
      }
    });

    function favKey() { return 'gh-favs-' + (config.username||'') + '/' + (config.repo||''); }
    function loadFavorites() {
      try { favorites = new Set(JSON.parse(localStorage.getItem(favKey()) || '[]')); }
      catch(_) { favorites = new Set(); }
    }
    function saveFavorites() {
      localStorage.setItem(favKey(), JSON.stringify([...favorites]));
      scheduleSyncPush();
    }
    function toggleFavorite(path) {
      if (favorites.has(path)) favorites.delete(path); else favorites.add(path);
      saveFavorites(); applySearch();
    }

    // ===== MULTI-DEVICE SYNC (theo mã người dùng) =====
    const SYNC_FILE = '.gh-sync.json';
    let syncSha = null;
    let syncPushTimer = null;
    let syncBusy = false;
    let lastRemotePlayback = null;
    let syncRootCache = null; // full file { profiles: { ... } }

    function getSyncCode() {
      const el = $('sync-code');
      const fromInput = el ? el.value.trim() : '';
      if (fromInput) return fromInput;
      return localStorage.getItem('gh-sync-code') || '';
    }
    function saveSyncCodeLocal(code) {
      const c = (code || '').trim();
      if (c) localStorage.setItem('gh-sync-code', c);
      else localStorage.removeItem('gh-sync-code');
      if ($('sync-code') && c) $('sync-code').value = c;
    }
    function syncCodeKey(code) {
      // Hash nhẹ — không lưu mã thô trên GitHub
      const s = String(code || '').trim().toLowerCase();
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
      return 'u' + (h >>> 0).toString(16);
    }
    function requireSyncCode(silent) {
      const code = getSyncCode();
      if (!code || code.length < 4) {
        if (!silent) showStatus('Nhập mã đồng bộ (≥4 ký tự) trong Cấu hình', 'error');
        return null;
      }
      return code;
    }
    function getDeviceId() {
      let id = localStorage.getItem('gh-device-id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem('gh-device-id', id);
      }
      return id;
    }
    function getDeviceName() {
      const ua = navigator.userAgent || '';
      let name = 'Web';
      if (/Android/i.test(ua)) name = 'Android';
      else if (/iPhone|iPad/i.test(ua)) name = 'iOS';
      else if (/Windows/i.test(ua)) name = 'Windows';
      else if (/Mac/i.test(ua)) name = 'Mac';
      else if (/Linux/i.test(ua)) name = 'Linux';
      if (/Chrome/i.test(ua) && !/Edge/i.test(ua)) name += ' Chrome';
      else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) name += ' Safari';
      else if (/Firefox/i.test(ua)) name += ' Firefox';
      return name;
    }
    function utf8ToBase64(str) {
      return btoa(unescape(encodeURIComponent(str)));
    }
    function base64ToUtf8(b64) {
      return decodeURIComponent(escape(atob(b64)));
    }
    function buildProfileData(existingDevices) {
      const devices = Object.assign({}, existingDevices || {});
      devices[getDeviceId()] = {
        name: getDeviceName(),
        lastSeen: Date.now()
      };
      const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
      Object.keys(devices).forEach(id => {
        if ((devices[id].lastSeen || 0) < cutoff) delete devices[id];
      });
      let playback = null;
      if (playlist.length && playlist[playlistIndex]) {
        const t = playlist[playlistIndex];
        playback = {
          path: t.path || '',
          name: t.name,
          url: t.url || '',
          time: audioEl ? (audioEl.currentTime || 0) : 0,
          updatedAt: Date.now(),
          deviceId: getDeviceId()
        };
      }
      return {
        updatedAt: Date.now(),
        label: getSyncCode().slice(0, 3) + '***',
        favorites: [...favorites],
        currentPath: currentPath || '',
        viewMode: viewMode || 'list',
        playback: playback,
        devices: devices
      };
    }
    async function loadSyncRoot() {
      const res = await githubFetch(SYNC_FILE);
      if (res.status === 404) {
        syncSha = null;
        syncRootCache = { version: 2, profiles: {} };
        return syncRootCache;
      }
      if (!res.ok) throw new Error((await res.json()).message || 'Lỗi đọc sync');
      const data = await res.json();
      syncSha = data.sha;
      let root = JSON.parse(base64ToUtf8(data.content.replace(/\n/g, '')));
      // migrate old format (no profiles)
      if (!root.profiles) {
        root = {
          version: 2,
          profiles: {
            _legacy: {
              updatedAt: root.updatedAt || Date.now(),
              favorites: root.favorites || [],
              playback: root.playback || null,
              devices: root.devices || {},
              currentPath: root.currentPath || '',
              viewMode: root.viewMode || 'list'
            }
          }
        };
      }
      syncRootCache = root;
      return root;
    }
    async function pullSync(silent) {
      if (!config.username || !config.repo || !config.token) return null;
      const code = requireSyncCode(silent);
      if (!code) return null;
      saveSyncCodeLocal(code);
      try {
        const root = await loadSyncRoot();
        const key = syncCodeKey(code);
        const profile = (root.profiles && root.profiles[key]) || null;
        if (!profile) {
          if (!silent) showStatus('Mã này chưa có dữ liệu — bấm Sync để tạo', 'info');
          return null;
        }
        if (Array.isArray(profile.favorites)) {
          // Với cùng mã: union favorites
          profile.favorites.forEach(p => favorites.add(p));
          localStorage.setItem(favKey(), JSON.stringify([...favorites]));
        }
        if (profile.playback && profile.playback.name && profile.playback.deviceId !== getDeviceId()) {
          lastRemotePlayback = profile.playback;
          showContinueListening(profile.playback);
        }
        if (!silent) {
          const n = profile.devices ? Object.keys(profile.devices).length : 1;
          showStatus('Sync mã «' + code + '» · ' + n + ' thiết bị', 'success');
        }
        applySearch();
        return profile;
      } catch (e) {
        if (!silent) showStatus('Sync kéo lỗi: ' + e.message, 'error');
        return null;
      }
    }
    async function pushSync(silent) {
      if (!config.username || !config.repo || !config.token) return false;
      const code = requireSyncCode(silent);
      if (!code) return false;
      if (syncBusy) return false;
      syncBusy = true;
      saveSyncCodeLocal(code);
      try {
        let root;
        try {
          root = await loadSyncRoot();
        } catch (_) {
          root = { version: 2, profiles: {} };
          syncSha = null;
        }
        if (!root.profiles) root.profiles = {};
        const key = syncCodeKey(code);
        const existing = root.profiles[key] || {};
        // merge favorites with existing profile
        const mergedFav = new Set([...(existing.favorites || []), ...favorites]);
        favorites = mergedFav;
        localStorage.setItem(favKey(), JSON.stringify([...favorites]));
        root.profiles[key] = buildProfileData(existing.devices || {});
        root.updatedAt = Date.now();

        const body = {
          message: 'Sync profile ' + key,
          content: utf8ToBase64(JSON.stringify(root, null, 2))
        };
        if (syncSha) body.sha = syncSha;
        const res = await githubFetch(SYNC_FILE, { method: 'PUT', body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json()).message || 'Push fail');
        const out = await res.json();
        if (out.content && out.content.sha) syncSha = out.content.sha;
        else {
          try { const c = await githubFetch(SYNC_FILE); if (c.ok) syncSha = (await c.json()).sha; } catch (_) {}
        }
        if (!silent) showStatus('Đã sync mã «' + code + '»', 'success');
        return true;
      } catch (e) {
        if (!silent) showStatus('Sync đẩy lỗi: ' + e.message, 'error');
        return false;
      } finally {
        syncBusy = false;
      }
    }
    function scheduleSyncPush() {
      if (!getSyncCode() || getSyncCode().length < 4) return;
      if (syncPushTimer) clearTimeout(syncPushTimer);
      syncPushTimer = setTimeout(() => pushSync(true), 2500);
    }
    function showContinueListening(pb) {
      const banner = $('sync-banner');
      if (!banner || !pb) return;
      const t = Math.floor(pb.time || 0);
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      banner.classList.remove('hidden');
      banner.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div><i class="fas fa-headphones" style="color:var(--primary)"></i> <strong>Tiếp tục nghe</strong></div>' +
          '<div class="sync-meta">' + (pb.name || '') + ' · ' + mm + ':' + ss + '</div>' +
        '</div>' +
        '<div class="sync-actions">' +
          '<button class="btn btn-play btn-sm" id="btn-continue-play"><i class="fas fa-play"></i> Phát</button>' +
          '<button class="btn btn-outline btn-sm" id="btn-continue-dismiss">Bỏ</button>' +
        '</div>';
      const playBtn = $('btn-continue-play');
      const dismissBtn = $('btn-continue-dismiss');
      if (playBtn) playBtn.onclick = () => {
        resumeRemotePlayback(pb);
        banner.classList.add('hidden');
      };
      if (dismissBtn) dismissBtn.onclick = () => banner.classList.add('hidden');
    }
    function resumeRemotePlayback(pb) {
      if (!pb) return;
      // Try find in current files
      let track = null;
      if (pb.path) {
        const f = allFiles.find(x => x.path === pb.path);
        if (f && f.download_url) track = { name: f.name, url: f.download_url, path: f.path };
      }
      if (!track && pb.name) {
        const f = allFiles.find(x => x.name === pb.name && x.type === 'file');
        if (f && f.download_url) track = { name: f.name, url: f.download_url, path: f.path };
      }
      if (!track && pb.url) track = { name: pb.name, url: pb.url, path: pb.path || '' };
      if (!track) { showStatus('Không tìm thấy bài trên thiết bị này', 'error'); return; }
      playlist = buildPlaylistFromFiles();
      if (!playlist.length) playlist = [track];
      let idx = playlist.findIndex(t => (t.path && t.path === track.path) || t.name === track.name);
      if (idx < 0) { playlist.unshift(track); idx = 0; }
      playlistIndex = idx;
      playMedia(track.url, track.name, true);
      const seekTo = pb.time || 0;
      const trySeek = () => {
        if (audioEl && audioEl.duration) {
          audioEl.currentTime = Math.min(seekTo, audioEl.duration - 0.5);
          updateMiniUI();
        } else setTimeout(trySeek, 300);
      };
      setTimeout(trySeek, 400);
      showStatus('Tiếp tục: ' + track.name, 'success');
    }
    async function fullSync() {
      if (!requireSyncCode(false)) return;
      const btn = $('btn-sync');
      if (btn) {
        btn.disabled = true;
        const icon = btn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
      }
      try {
        await pullSync(true);
        await pushSync(false);
      } finally {
        if (btn) {
          btn.disabled = false;
          const icon = btn.querySelector('i');
          if (icon) icon.classList.remove('fa-spin');
        }
      }
    }

    function setViewMode(mode) {
      viewMode = mode;
      localStorage.setItem('gh-view-mode', mode);
      $('file-list').classList.toggle('grid-view', mode === 'grid');
      $('btn-view-list').classList.toggle('active', mode === 'list');
      $('btn-view-grid').classList.toggle('active', mode === 'grid');
      applySearch();
    }
    function toggleStarFilter() {
      showOnlyStars = !showOnlyStars;
      $('btn-filter-star').classList.toggle('active', showOnlyStars);
      applySearch();
    }

    function showStatus(msg, type) {
      type = type || 'info';
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
      };
      const wrap = $('toast-wrap');
      if (!wrap) return;
      const t = document.createElement('div');
      t.className = 'toast ' + type;
      t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i><span></span>';
      t.querySelector('span').textContent = msg;
      wrap.appendChild(t);
      const remove = () => {
        t.classList.add('hiding');
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
      };
      t.onclick = remove;
      setTimeout(remove, 2800);
    }
    function formatSize(b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
      if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
      return (b/1073741824).toFixed(2) + ' GB';
    }
    function getFileExt(n) { return (n.split('.').pop()||'').toLowerCase(); }
    function isVideo(n) { return ['mp4','webm','ogg','mov','m4v','mkv'].includes(getFileExt(n)); }
    function isAudio(n) { return ['mp3','wav','ogg','m4a','aac','flac','wma'].includes(getFileExt(n)); }
    function isImage(n) { return ['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(getFileExt(n)); }
    function getFileIcon(name) {
      if (isVideo(name)) return 'fa-file-video';
      if (isAudio(name)) return 'fa-file-audio';
      if (isImage(name)) return 'fa-file-image';
      const m = { pdf:'fa-file-pdf', zip:'fa-file-zipper', rar:'fa-file-zipper', txt:'fa-file-lines', md:'fa-file-lines', js:'fa-file-code', json:'fa-file-code', html:'fa-file-code', css:'fa-file-code', py:'fa-file-code' };
      return m[getFileExt(name)] || 'fa-file';
    }
    function getIconClass(n) {
      if (isVideo(n)) return 'video'; if (isAudio(n)) return 'audio'; if (isImage(n)) return 'image'; return '';
    }
    function fmtTime(s) {
      s = Math.floor(s||0);
      return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
    }

    // ===== PROMPT =====
    function showPrompt(title, def) {
      return new Promise(r => {
        promptResolve = r;
        $('prompt-title').textContent = title;
        $('prompt-input').value = def||'';
        $('prompt-modal').classList.add('show');
        setTimeout(() => { $('prompt-input').focus(); $('prompt-input').select(); }, 80);
      });
    }
    function closePrompt(v) {
      $('prompt-modal').classList.remove('show');
      if (promptResolve) { promptResolve(v); promptResolve = null; }
    }
    $('prompt-ok').onclick = () => closePrompt($('prompt-input').value.trim());
    $('prompt-cancel').onclick = () => closePrompt(null);
    $('prompt-close').onclick = () => closePrompt(null);
    $('prompt-input').onkeypress = e => { if (e.key==='Enter') closePrompt($('prompt-input').value.trim()); };

    // ===== BREADCRUMB =====
    function updateBreadcrumb() {
      const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
      let html = '<span class="breadcrumb-item '+(parts.length===0?'current':'')+'" data-path=""><i class="fas fa-home"></i> Gốc</span>';
      let p = '';
      parts.forEach((part,i) => {
        p += (p?'/':'')+part;
        html += '<span class="breadcrumb-sep"><i class="fas fa-chevron-right"></i></span>';
        html += '<span class="breadcrumb-item '+(i===parts.length-1?'current':'')+'" data-path="'+p+'">'+part+'</span>';
      });
      $('breadcrumb').innerHTML = html;
      $('breadcrumb').querySelectorAll('.breadcrumb-item:not(.current)').forEach(el => {
        el.onclick = () => navigateTo(el.dataset.path);
      });
    }
    function pathKey() {
      return 'gh-path-' + (config.username || '') + '/' + (config.repo || '');
    }
    function saveCurrentPath() {
      try { localStorage.setItem(pathKey(), currentPath || ''); } catch(_) {}
      scheduleSyncPush();
    }
    function loadCurrentPath() {
      try { return localStorage.getItem(pathKey()) || ''; } catch(_) { return ''; }
    }
    function navigateTo(path) {
      currentPath = path || '';
      saveCurrentPath();
      $('custom-path').value = currentPath ? currentPath + '/' : '';
      selectedPaths.clear(); updateBatchBar(); listFiles();
    }

    // ===== QUOTA =====
    async function updateQuota() {
      try {
        const res = await fetch('https://api.github.com/repos/'+config.username+'/'+config.repo, {
          headers: { 'Authorization': 'token '+config.token, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!res.ok) return;
        const data = await res.json();
        const sizeKB = data.size || 0; // GitHub returns KB
        const sizeBytes = sizeKB * 1024;
        // Soft limit display ~1GB warning visual
        const limit = 1024 * 1024 * 1024; // 1GB visual
        const pct = Math.min(100, (sizeBytes / limit) * 100);
        $('quota-bar').classList.add('show');
        $('quota-fill').style.width = pct.toFixed(1) + '%';
        $('quota-text').textContent = formatSize(sizeBytes);
      } catch(_) {}
    }

    // ===== SLEEP TIMER =====
    function setSleep(minutes) {
      if (sleepTimer) clearTimeout(sleepTimer);
      if (!minutes) {
        sleepEndsAt = 0;
        $('sleep-badge').classList.add('hidden');
        showStatus('Đã tắt sleep timer', 'info');
        return;
      }
      sleepEndsAt = Date.now() + minutes * 60 * 1000;
      $('sleep-badge').textContent = minutes + 'p';
      $('sleep-badge').classList.remove('hidden');
      sleepTimer = setTimeout(() => {
        if (audioEl) { audioEl.pause(); isPlaying = false; updateMiniUI(); }
        if (plyrInstance) try { plyrInstance.pause(); } catch(_){}
        sleepEndsAt = 0;
        $('sleep-badge').classList.add('hidden');
        showStatus('Sleep timer: đã dừng phát', 'info');
      }, minutes * 60 * 1000);
      showStatus('Sleep timer: tắt sau ' + minutes + ' phút', 'success');
    }
    async function pickSleep() {
      const v = await showPrompt('Sleep timer (phút: 15 / 30 / 60, 0 = tắt)', '30');
      if (v === null) return;
      const m = parseInt(v, 10);
      if (isNaN(m) || m < 0) return;
      setSleep(m);
    }

    // ===== MEDIA SESSION =====
    function updateMediaSession(track) {
      if (!('mediaSession' in navigator) || !track) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.name,
          artist: config.repo || 'GitHub File Storage',
          album: currentPath || 'Root'
        });
        navigator.mediaSession.setActionHandler('play', () => { if (audioEl) { audioEl.play(); isPlaying = true; updateMiniUI(); } });
        navigator.mediaSession.setActionHandler('pause', () => { if (audioEl) { audioEl.pause(); isPlaying = false; updateMiniUI(); } });
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      } catch(_) {}
    }

    // ===== MINI PLAYER =====
    function showMini(track) {
      $('mini-player').classList.add('show');
      $('mini-title').textContent = track.name;
      updateMiniUI();
      updatePlaylistUI();
    }
    function hideMini() {
      $('mini-player').classList.remove('show');
      const fill = $('mini-progress');
      if (fill) fill.style.width = '0%';
      const thumb = $('mini-thumb');
      if (thumb) thumb.style.left = '0%';
    }
    function updateMiniUI() {
      const playIcon = $('mini-play-icon');
      if (playIcon) playIcon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
      const disc = $('mini-disc');
      if (disc) disc.classList.toggle('spinning', !!isPlaying);
      if (audioEl && !seekDragging) {
        const cur = audioEl.currentTime || 0, dur = audioEl.duration || 0;
        const t = $('mini-time');
        if (t) t.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
        const pct = dur ? (cur / dur * 100) : 0;
        const fill = $('mini-progress');
        if (fill) fill.style.width = pct + '%';
        const thumb = $('mini-thumb');
        if (thumb) thumb.style.left = pct + '%';
      }
    }
    let seekDragging = false;
    function seekFromEvent(e) {
      if (!audioEl || !audioEl.duration) return;
      const seek = $('mini-seek');
      const rect = seek.getBoundingClientRect();
      const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX
        : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX
        : e.clientX;
      let ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      audioEl.currentTime = ratio * audioEl.duration;
      const pct = ratio * 100;
      const fill = $('mini-progress');
      if (fill) fill.style.width = pct + '%';
      const thumb = $('mini-thumb');
      if (thumb) thumb.style.left = pct + '%';
      const t = $('mini-time');
      if (t) t.textContent = fmtTime(audioEl.currentTime) + ' / ' + fmtTime(audioEl.duration);
    }
    (function bindSeek() {
      const seek = $('mini-seek');
      if (!seek) return;
      const onStart = (e) => {
        seekDragging = true;
        seek.classList.add('dragging');
        seekFromEvent(e);
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!seekDragging) return;
        seekFromEvent(e);
        e.preventDefault();
      };
      const onEnd = (e) => {
        if (!seekDragging) return;
        seekFromEvent(e);
        seekDragging = false;
        seek.classList.remove('dragging');
      };
      seek.addEventListener('mousedown', onStart);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      seek.addEventListener('touchstart', onStart, { passive: false });
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      seek.addEventListener('click', (e) => { if (!seekDragging) seekFromEvent(e); });
    })();
    function bindAudioEvents(el) {
      audioEl = el;
      el.ontimeupdate = updateMiniUI;
      el.onplay = () => { isPlaying = true; updateMiniUI(); scheduleSyncPush(); };
      el.onpause = () => { isPlaying = false; updateMiniUI(); scheduleSyncPush(); };
      el.onended = () => {
        if (repeatMode === 2) {
          el.currentTime = 0;
          el.play();
          return;
        }
        if (playlist.length > 1 || repeatMode === 1) playNext();
        else { isPlaying = false; updateMiniUI(); }
      };
    }

    // ===== PLAYLIST =====
    function buildPlaylistFromFiles() {
      return allFiles.filter(f => f.type==='file' && isAudio(f.name) && f.download_url)
        .map(f => ({ name: f.name, url: f.download_url, path: f.path }));
    }
    function updateMusicBar() {
      $('music-bar').classList.toggle('show', buildPlaylistFromFiles().length > 0);
    }
    function updatePlaylistUI() {
      const c = $('playlist-controls');
      if (playlist.length >= 1) {
        c.style.display = 'flex';
        $('pl-info').textContent = (playlistIndex+1)+' / '+playlist.length;
        $('pl-shuffle').classList.toggle('active', shuffleMode);
        const rb = $('pl-repeat');
        rb.classList.toggle('active', repeatMode > 0);
        rb.innerHTML = repeatMode === 2
          ? '<i class="fas fa-repeat"></i><span style="font-size:0.55rem;margin-left:1px">1</span>'
          : '<i class="fas fa-repeat"></i>';
        rb.title = repeatMode === 0 ? 'Lặp lại: Tắt' : (repeatMode === 1 ? 'Lặp list' : 'Lặp 1 bài');
      } else c.style.display = 'none';

      // Sync mini player buttons
      const ms = $('mini-shuffle'), mr = $('mini-repeat');
      if (ms) ms.classList.toggle('active', shuffleMode);
      if (mr) {
        mr.classList.toggle('active', repeatMode > 0);
        mr.innerHTML = repeatMode === 2
          ? '<i class="fas fa-repeat"></i><span class="badge-1">1</span>'
          : '<i class="fas fa-repeat"></i>';
        mr.title = repeatMode === 0 ? 'Lặp lại: Tắt' : (repeatMode === 1 ? 'Lặp list' : 'Lặp 1 bài');
      }
    }
    function getNextIndex(dir) {
      if (!playlist.length) return 0;
      // Lặp 1 bài: luôn giữ index hiện tại khi next do hết bài
      if (repeatMode === 2 && dir === 1) return playlistIndex;
      if (shuffleMode) {
        if (shuffleOrder.length !== playlist.length) {
          shuffleOrder = playlist.map((_,i)=>i);
          for (let i=shuffleOrder.length-1;i>0;i--) {
            const j=Math.floor(Math.random()*(i+1));
            [shuffleOrder[i],shuffleOrder[j]]=[shuffleOrder[j],shuffleOrder[i]];
          }
          const cur=shuffleOrder.indexOf(playlistIndex);
          if (cur>0) { shuffleOrder.splice(cur,1); shuffleOrder.unshift(playlistIndex); }
        }
        const pos = shuffleOrder.indexOf(playlistIndex);
        let np = pos + dir;
        if (np >= shuffleOrder.length) np = (repeatMode === 1) ? 0 : shuffleOrder.length-1;
        if (np < 0) np = (repeatMode === 1) ? shuffleOrder.length-1 : 0;
        return shuffleOrder[np];
      }
      let n = playlistIndex + dir;
      if (n >= playlist.length) n = (repeatMode === 1) ? 0 : playlist.length-1;
      if (n < 0) n = (repeatMode === 1) ? playlist.length-1 : 0;
      return n;
    }
    function playTrackAt(index) {
      if (!playlist.length) return;
      playlistIndex = index;
      playMedia(playlist[index].url, playlist[index].name, true);
    }
    function playNext() { playTrackAt(getNextIndex(1)); }
    function playPrev() { playTrackAt(getNextIndex(-1)); }

    function playMedia(url, filename, fromPlaylist) {
      if (plyrInstance) { try { plyrInstance.destroy(); } catch(_){} plyrInstance = null; }
      const body = $('modal-body');
      body.innerHTML = '';
      $('modal-title').textContent = filename;

      if (isAudio(filename) && !fromPlaylist) {
        playlist = buildPlaylistFromFiles();
        playlistIndex = Math.max(0, playlist.findIndex(t => t.url===url || t.name===filename));
        if (playlistIndex < 0) { playlist = [{name:filename,url}]; playlistIndex = 0; }
        shuffleOrder = [];
      }

      if (isImage(filename)) {
        const img = document.createElement('img');
        img.src = url; img.alt = filename;
        body.appendChild(img);
        $('playlist-controls').style.display = 'none';
        $('media-modal').classList.add('show');
        return;
      }
      if (isVideo(filename)) {
        const video = document.createElement('video');
        video.playsInline = true; video.controls = true; video.src = url;
        body.appendChild(video);
        plyrInstance = new Plyr(video, {
          controls: ['play-large','play','progress','current-time','mute','volume','fullscreen'],
          autoplay: true, ratio: '16:9'
        });
        $('playlist-controls').style.display = 'none';
        hideMini();
        $('media-modal').classList.add('show');
        return;
      }
      if (isAudio(filename)) {
        // Prefer mini player — don't force full modal
        const audio = document.createElement('audio');
        audio.src = url;
        audio.autoplay = true;
        body.appendChild(audio);
        bindAudioEvents(audio);
        isPlaying = true;
        showMini({ name: filename, url });
        updateMediaSession({ name: filename });
        updatePlaylistUI();
        // Also setup plyr if modal open
        plyrInstance = new Plyr(audio, {
          controls: ['play','progress','current-time','duration','mute','volume'],
          autoplay: true
        });
        // Keep mini in sync with plyr
        plyrInstance.on('play', () => { isPlaying = true; updateMiniUI(); });
        plyrInstance.on('pause', () => { isPlaying = false; updateMiniUI(); });
        plyrInstance.on('ended', () => {
          if (repeatMode === 2) {
            try { plyrInstance.restart(); plyrInstance.play(); } catch(_) {
              if (audioEl) { audioEl.currentTime = 0; audioEl.play(); }
            }
            return;
          }
          if (playlist.length > 1 || repeatMode === 1) playNext();
        });
        // Don't auto-open modal for audio — use mini player
      }
    }

    function closeMediaModal() {
      // Closing modal doesn't stop audio — mini player keeps going
      $('media-modal').classList.remove('show');
      document.body.style.overflow = '';
    }
    function stopAllMedia() {
      if (plyrInstance) { try { plyrInstance.destroy(); } catch(_){} plyrInstance = null; }
      if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null; }
      isPlaying = false;
      hideMini();
      $('modal-body').innerHTML = '';
      $('media-modal').classList.remove('show');
    }

    function playAll(shuffle) {
      playlist = buildPlaylistFromFiles();
      if (!playlist.length) { showStatus('Không có file nhạc', 'info'); return; }
      shuffleMode = !!shuffle; shuffleOrder = [];
      playlistIndex = shuffle ? Math.floor(Math.random()*playlist.length) : 0;
      playTrackAt(playlistIndex);
    }

    // Mini controls
    $('mini-play').onclick = () => {
      if (!audioEl) return;
      if (audioEl.paused) { audioEl.play(); isPlaying = true; }
      else { audioEl.pause(); isPlaying = false; }
      updateMiniUI();
    };
    $('mini-prev').onclick = () => playPrev();
    $('mini-next').onclick = () => playNext();
    $('mini-close').onclick = () => stopAllMedia();
    $('mini-shuffle').onclick = () => {
      shuffleMode = !shuffleMode;
      shuffleOrder = [];
      updatePlaylistUI();
      showStatus(shuffleMode ? 'Bật ngẫu nhiên' : 'Tắt ngẫu nhiên', 'info');
    };
    $('mini-repeat').onclick = () => {
      repeatMode = (repeatMode + 1) % 3;
      updatePlaylistUI();
      const msgs = ['Tắt lặp lại', 'Lặp cả list', 'Lặp 1 bài'];
      showStatus(msgs[repeatMode], 'info');
    };

    $('media-modal').onclick = e => { if (e.target === $('media-modal')) closeMediaModal(); };
    $('modal-close').onclick = closeMediaModal;
    $('pl-next').onclick = e => { e.stopPropagation(); playNext(); };
    $('pl-prev').onclick = e => { e.stopPropagation(); playPrev(); };
    $('pl-shuffle').onclick = e => {
      e.stopPropagation(); shuffleMode = !shuffleMode; shuffleOrder = []; updatePlaylistUI();
      showStatus(shuffleMode ? 'Bật ngẫu nhiên' : 'Tắt ngẫu nhiên', 'info');
    };
    $('pl-repeat').onclick = e => {
      e.stopPropagation();
      // 0 → 1 (list) → 2 (one) → 0
      repeatMode = (repeatMode + 1) % 3;
      updatePlaylistUI();
      const msgs = ['Tắt lặp lại', 'Lặp cả list', 'Lặp 1 bài'];
      showStatus(msgs[repeatMode], 'info');
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('media-modal').classList.contains('show')) closeMediaModal();
        if ($('prompt-modal').classList.contains('show')) closePrompt(null);
      }
      if (playlist.length > 1) {
        if (e.key === 'ArrowRight') playNext();
        if (e.key === 'ArrowLeft') playPrev();
      }
    });

    // ===== CONFIG =====
    function loadConfig() {
      const s = localStorage.getItem('gh-file-storage');
      const sc = localStorage.getItem('gh-sync-code') || '';
      if ($('sync-code')) $('sync-code').value = sc;
      if (s) {
        config = JSON.parse(s);
        $('username').value = config.username||'';
        $('repo').value = config.repo||'';
        $('token').value = config.token||'';
        if (config.syncCode && $('sync-code') && !$('sync-code').value) {
          $('sync-code').value = config.syncCode;
        }
        return true;
      }
      return false;
    }
    function saveConfig() {
      config.username = $('username').value.trim();
      config.repo = $('repo').value.trim();
      config.token = $('token').value.trim();
      config.syncCode = getSyncCode();
      saveSyncCodeLocal(config.syncCode);
      localStorage.setItem('gh-file-storage', JSON.stringify(config));
      const pw = $('app-password').value;
      if (pw) setAppPassword(pw);
      showStatus('Đã lưu cấu hình', 'success');
    }
    function toggleConfig() {
      configCollapsed = !configCollapsed;
      const body = $('config-body'), icon = $('config-toggle-icon');
      if (configCollapsed) {
        body.classList.add('collapsed'); body.style.maxHeight = '0';
        icon.className = 'fas fa-chevron-down';
      } else {
        body.classList.remove('collapsed'); body.style.maxHeight = body.scrollHeight+50+'px';
        icon.className = 'fas fa-chevron-up';
      }
      localStorage.setItem('gh-config-collapsed', configCollapsed?'1':'0');
    }
    function setConnectedUI(ok) {
      if (ok) {
        $('connected-badge').classList.remove('hidden');
        if (!configCollapsed) toggleConfig();
      } else $('connected-badge').classList.add('hidden');
    }

    // ===== GITHUB =====
    async function githubFetch(path, options) {
      options = options||{};
      return fetch('https://api.github.com/repos/'+config.username+'/'+config.repo+'/contents/'+path, {
        ...options,
        headers: {
          'Authorization': 'token '+config.token,
          'Accept': 'application/vnd.github.v3+json',
          ...(options.headers||{})
        }
      });
    }
    async function listFiles() {
      updateBreadcrumb();
      try {
        const res = await githubFetch(currentPath);
        if (res.status === 404) { allFiles = []; currentPage = 1; applySearch(false); return; }
        if (!res.ok) throw new Error((await res.json()).message || 'Lỗi');
        const data = await res.json();
        allFiles = Array.isArray(data) ? data : [data];
        applySearch();
        updateQuota();
      } catch(e) { showStatus('Lỗi: '+e.message, 'error'); }
    }
    function applySearch(resetPage) {
      if (resetPage !== false) currentPage = 1;
      const q = ($('search-input').value || '').trim().toLowerCase();
      let files = allFiles.slice();
      if (q) files = files.filter(f => f.name.toLowerCase().includes(q));
      if (showOnlyStars) files = files.filter(f => favorites.has(f.path));
      files.sort((a, b) => {
        const as = favorites.has(a.path) ? 0 : 1, bs = favorites.has(b.path) ? 0 : 1;
        if (as !== bs) return as - bs;
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      filteredFilesCache = files;
      const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      renderFileList(files);
      updatePagination(files.length);
      updateMusicBar();
    }

    function updatePagination(totalItems) {
      const pag = $('pagination');
      if (!pag) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (totalItems <= PAGE_SIZE) {
        pag.classList.remove('show');
        return;
      }
      pag.classList.add('show');
      $('page-prev').disabled = currentPage <= 1;
      $('page-next').disabled = currentPage >= totalPages;
      let nums = pag.querySelector('.page-nums');
      if (!nums) {
        nums = document.createElement('div');
        nums.className = 'page-nums';
        nums.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
        pag.insertBefore(nums, $('page-next'));
      }
      nums.innerHTML = '';
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + 4);
      start = Math.max(1, end - 4);
      for (let i = start; i <= end; i++) {
        const b = document.createElement('button');
        b.className = 'page-btn' + (i === currentPage ? ' active' : '');
        b.textContent = i;
        b.onclick = () => { currentPage = i; applySearch(false); };
        nums.appendChild(b);
      }
    }

    function goPage(delta) {
      const totalPages = Math.max(1, Math.ceil(filteredFilesCache.length / PAGE_SIZE));
      currentPage = Math.min(totalPages, Math.max(1, currentPage + delta));
      applySearch(false);
    }

    function renderFileList(files) {
      const listEl = $('file-list');
      listEl.classList.toggle('grid-view', viewMode==='grid');
      if (!files || !files.length) {
        listEl.innerHTML = '<li class="empty-state"><i class="fas fa-inbox"></i><p>'+
          (showOnlyStars?'Chưa có yêu thích':(($('search-input').value||'').trim()?'Không tìm thấy':'Thư mục trống'))+
          '</p></li>';
        updatePagination(0);
        return;
      }
      // Phân trang: chỉ lấy 5 mục của trang hiện tại
      const start = (currentPage - 1) * PAGE_SIZE;
      const pageFiles = files.slice(start, start + PAGE_SIZE);
      const isGrid = viewMode==='grid';
      listEl.innerHTML = pageFiles.map(f => {
        const isDir = f.type==='dir';
        const icon = isDir?'fa-folder':getFileIcon(f.name);
        const iconClass = isDir?'folder':getIconClass(f.name);
        const size = isDir?'Thư mục':formatSize(f.size);
        const canPlay = !isDir && (isVideo(f.name)||isAudio(f.name)||isImage(f.name));
        const checked = selectedPaths.has(f.path)?'checked':'';
        const selectedClass = selectedPaths.has(f.path)?'selected':'';
        const starClass = favorites.has(f.path)?'starred':'';
        let preview = (isGrid && !isDir && isImage(f.name) && f.download_url)
          ? '<img class="file-thumb" src="'+f.download_url+'" alt="'+f.name+'" loading="lazy" />'
          : '<div class="file-icon '+iconClass+'"><i class="fas '+icon+'"></i></div>';
        let actions = '';
        if (isGrid) actions += '<button class="btn btn-star-grid '+starClass+' btn-star-toggle" data-path="'+f.path+'"><i class="fas fa-star"></i></button>';
        if (canPlay) actions += '<button class="btn btn-play btn-play-media" data-url="'+(f.download_url||'')+'" data-name="'+f.name+'"><i class="fas fa-circle-play"></i></button>';
        if (!isGrid) actions += '<button class="btn btn-star '+starClass+' btn-star-toggle" data-path="'+f.path+'"><i class="fas fa-star"></i></button>';
        if (!isDir) {
          actions += '<button class="btn btn-outline btn-copy" data-url="'+(f.download_url||'')+'"><i class="fas fa-copy"></i></button>';
          actions += '<button class="btn btn-outline btn-qr" data-url="'+(f.download_url||'')+'" data-name="'+f.name+'" title="QR tải file"><i class="fas fa-qrcode"></i></button>';
          actions += '<a class="btn btn-outline" href="'+(f.download_url||'')+'" target="_blank" download><i class="fas fa-download"></i></a>';
        }
        actions += '<button class="btn btn-outline btn-rename" data-path="'+f.path+'" data-name="'+f.name+'" data-type="'+f.type+'" data-sha="'+(f.sha||'')+'"><i class="fas fa-pen-to-square"></i></button>';
        if (!isDir) actions += '<button class="btn btn-danger btn-delete" data-path="'+f.path+'" data-sha="'+f.sha+'"><i class="fas fa-trash-can"></i></button>';
        else actions += '<button class="btn btn-outline btn-enter-folder" data-path="'+f.path+'"><i class="fas fa-folder-open"></i></button>';
        return '<li class="file-item '+(isDir?'folder ':'')+selectedClass+'" data-path="'+f.path+'">'+
          '<div class="file-row">'+
            '<div class="file-info">'+
              '<input type="checkbox" class="file-check" data-path="'+f.path+'" data-sha="'+(f.sha||'')+'" data-type="'+f.type+'" '+checked+' />'+
              preview+
              '<div style="min-width:0;flex:1"><div class="file-name">'+f.name+'</div><div class="file-meta">'+size+'</div></div>'+
            '</div>'+
          '</div>'+
          '<div class="file-actions">'+actions+'</div></li>';
      }).join('');

      document.querySelectorAll('.file-item.folder').forEach(item => {
        item.onclick = e => {
          if (e.target.closest('button,a,input')) return;
          navigateTo(item.dataset.path);
        };
      });
      document.querySelectorAll('.btn-enter-folder').forEach(b => b.onclick = e => { e.stopPropagation(); navigateTo(b.dataset.path); });
      document.querySelectorAll('.btn-delete').forEach(b => b.onclick = e => { e.stopPropagation(); deleteFile(b.dataset.path, b.dataset.sha); });
      document.querySelectorAll('.btn-play-media').forEach(b => b.onclick = e => { e.stopPropagation(); playMedia(b.dataset.url, b.dataset.name); });
      document.querySelectorAll('.btn-copy').forEach(b => b.onclick = e => {
        e.stopPropagation();
        navigator.clipboard.writeText(b.dataset.url).then(() => showStatus('Đã copy link!', 'success'));
      });
      document.querySelectorAll('.btn-qr').forEach(b => b.onclick = e => {
        e.stopPropagation();
        showQr(b.dataset.url, b.dataset.name);
      });
      document.querySelectorAll('.btn-rename').forEach(b => b.onclick = e => {
        e.stopPropagation(); renameItem(b.dataset.path, b.dataset.name, b.dataset.type, b.dataset.sha);
      });
      document.querySelectorAll('.btn-star-toggle').forEach(b => b.onclick = e => { e.stopPropagation(); toggleFavorite(b.dataset.path); });
      document.querySelectorAll('.file-check').forEach(cb => {
        cb.onchange = e => {
          e.stopPropagation();
          if (cb.checked) selectedPaths.add(cb.dataset.path); else selectedPaths.delete(cb.dataset.path);
          updateBatchBar();
          cb.closest('.file-item').classList.toggle('selected', cb.checked);
        };
        cb.onclick = e => e.stopPropagation();
      });
      if (isGrid) {
        document.querySelectorAll('.file-thumb').forEach(img => {
          img.onclick = e => {
            e.stopPropagation();
            const btn = img.closest('.file-item').querySelector('.btn-play-media');
            if (btn) playMedia(btn.dataset.url, btn.dataset.name);
          };
        });
      }
    }

    function updateBatchBar() {
      const n = selectedPaths.size;
      $('batch-bar').classList.toggle('show', n>0);
      $('batch-count').textContent = n+' đã chọn';
    }

    async function createFolder() {
      const name = await showPrompt('Tên thư mục mới','');
      if (!name) return;
      const clean = name.replace(/[\\/:*?"<>|]/g,'').trim();
      if (!clean) return showStatus('Tên không hợp lệ','error');
      const path = currentPath ? currentPath+'/'+clean+'/.gitkeep' : clean+'/.gitkeep';
      try {
        const res = await githubFetch(path, { method:'PUT', body: JSON.stringify({ message:'Add files via upload', content: btoa('') }) });
        if (!res.ok) throw new Error((await res.json()).message);
        showStatus('Đã tạo thư mục: '+clean,'success'); listFiles();
      } catch(e) { showStatus('Lỗi: '+e.message,'error'); }
    }

    async function renameItem(oldPath, oldName, type, sha) {
      // Chỉ hiện phần tên (không đuôi) khi đổi tên file
      let nameOnly = oldName;
      let ext = '';
      if (type !== 'dir' && oldName.includes('.')) {
        const dot = oldName.lastIndexOf('.');
        nameOnly = oldName.slice(0, dot);
        ext = oldName.slice(dot); // gồm dấu chấm, vd: .mp3
      }
      const newName = await showPrompt('Đổi tên (giữ nguyên đuôi' + (ext || '') + ')', nameOnly);
      if (!newName || newName === nameOnly) return;
      let clean = newName.replace(/[\\/:*?"<>|]/g, '').trim();
      if (!clean) return showStatus('Tên không hợp lệ', 'error');
      // Nếu user không gõ đuôi, tự gắn lại đuôi cũ
      if (ext && !clean.toLowerCase().endsWith(ext.toLowerCase())) {
        clean = clean + ext;
      }
      if (clean === oldName) return;
      const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : '';
      const newPath = parent ? parent + '/' + clean : clean;
      try {
        if (type==='dir') {
          const res = await githubFetch(oldPath);
          if (!res.ok) throw new Error('Không đọc thư mục');
          const list = await res.json();
          for (const item of (Array.isArray(list)?list:[list])) {
            if (item.type!=='file') continue;
            const fd = await (await githubFetch(item.path)).json();
            const dest = item.path.replace(oldPath, newPath);
            await githubFetch(dest, { method:'PUT', body: JSON.stringify({ message:'Add files via upload', content: fd.content, encoding:'base64' }) });
            await githubFetch(item.path, { method:'DELETE', body: JSON.stringify({ message:'Delete file via upload', sha: item.sha }) });
          }
        } else {
          const fd = await (await githubFetch(oldPath)).json();
          const put = await githubFetch(newPath, { method:'PUT', body: JSON.stringify({ message:'Add files via upload', content: fd.content, encoding:'base64' }) });
          if (!put.ok) throw new Error((await put.json()).message);
          await githubFetch(oldPath, { method:'DELETE', body: JSON.stringify({ message:'Delete file via upload', sha }) });
        }
        if (favorites.has(oldPath)) { favorites.delete(oldPath); favorites.add(newPath); saveFavorites(); }
        showStatus('Đã đổi tên: '+clean,'success'); listFiles();
      } catch(e) { showStatus('Lỗi: '+e.message,'error'); }
    }

    async function uploadFiles() {
      if (!selectedFiles.length) return;
      let customPath = $('custom-path').value.trim().replace(/^\/+|\/+$/g,'');
      if (!customPath && currentPath) customPath = currentPath;
      const wrap = $('progress-wrap'), bar = $('progress-bar'), txt = $('progress-text');
      wrap.classList.add('show'); bar.style.width='0%';
      $('btn-upload').disabled = true;
      $('btn-upload').innerHTML = '<span class="spinner"></span> Uploading...';
      let ok=0, fail=0, total=selectedFiles.length;
      for (let i=0;i<selectedFiles.length;i++) {
        const file = selectedFiles[i];
        txt.textContent = 'Upload '+(i+1)+'/'+total+' ('+file.name+')';
        try {
          const content = await new Promise((res,rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej; r.readAsDataURL(file);
          });
          const path = customPath ? customPath+'/'+file.name : file.name;
          let sha=null;
          try { const c=await githubFetch(path); if(c.ok) sha=(await c.json()).sha; } catch(_){}
          const body = { message:'Add files via upload', content }; if (sha) body.sha=sha;
          const res = await githubFetch(path, { method:'PUT', body: JSON.stringify(body) });
          if (!res.ok) throw new Error((await res.json()).message);
          ok++;
        } catch(e) { console.error(e); fail++; }
        bar.style.width = Math.round(((i+1)/total)*100)+'%';
        txt.textContent = Math.round(((i+1)/total)*100)+'%';
      }
      $('btn-upload').disabled=false;
      $('btn-upload').innerHTML='<i class="fas fa-cloud-arrow-up"></i> Upload';
      selectedFiles=[]; $('file-input').value=''; updateUploadButton();
      setTimeout(()=>{ wrap.classList.remove('show'); bar.style.width='0%'; },1500);
      if (ok) { showStatus('Upload '+ok+' file'+(fail?', lỗi '+fail:''), fail?'info':'success'); listFiles(); }
      else showStatus('Upload thất bại','error');
    }

    async function deleteFile(path, sha) {
      if (!confirm('Xóa "'+path+'"?')) return;
      try {
        const res = await githubFetch(path, { method:'DELETE', body: JSON.stringify({ message:'Delete file via upload', sha }) });
        if (!res.ok) throw new Error((await res.json()).message);
        selectedPaths.delete(path); favorites.delete(path); saveFavorites(); updateBatchBar();
        showStatus('Đã xóa: '+path,'success'); listFiles();
      } catch(e) { showStatus('Lỗi: '+e.message,'error'); }
    }
    async function batchDelete() {
      if (!selectedPaths.size) return;
      if (!confirm('Xóa '+selectedPaths.size+' mục?')) return;
      let ok=0,fail=0;
      document.querySelectorAll('.file-check:checked').forEach(async ()=>{});
      const items = [];
      document.querySelectorAll('.file-check:checked').forEach(cb => {
        if (cb.dataset.type==='file') items.push({ path: cb.dataset.path, sha: cb.dataset.sha });
      });
      for (const it of items) {
        try {
          const res = await githubFetch(it.path, { method:'DELETE', body: JSON.stringify({ message:'Delete file via upload', sha: it.sha }) });
          if (res.ok) { ok++; favorites.delete(it.path); } else fail++;
        } catch(_){ fail++; }
      }
      saveFavorites(); selectedPaths.clear(); updateBatchBar();
      showStatus('Đã xóa '+ok+(fail?', lỗi '+fail:''), fail?'info':'success'); listFiles();
    }

    async function connect(silent) {
      config.username=$('username').value.trim();
      config.repo=$('repo').value.trim();
      config.token=$('token').value.trim();
      if (!config.username||!config.repo||!config.token) {
        if (!silent) showStatus('Điền đầy đủ thông tin','error'); return false;
      }
      if (!silent) showStatus('Đang kết nối...','info');
      try {
        const res = await fetch('https://api.github.com/repos/'+config.username+'/'+config.repo, {
          headers: { 'Authorization':'token '+config.token, 'Accept':'application/vnd.github.v3+json' }
        });
        if (!res.ok) throw new Error((await res.json()).message||'Lỗi');
        config.syncCode = getSyncCode();
        saveSyncCodeLocal(config.syncCode);
        localStorage.setItem('gh-file-storage', JSON.stringify(config));
        const pw = $('app-password').value;
        if (pw) setAppPassword(pw);
        loadFavorites();
        if (!silent) showStatus('Kết nối thành công!','success');
        $('main-area').classList.remove('hidden');
        setConnectedUI(true);
        currentPath = loadCurrentPath();
        $('custom-path').value = currentPath ? currentPath + '/' : '';
        selectedPaths.clear();
        await listFiles();
        // Đồng bộ theo mã người dùng (nếu đã nhập)
        if (getSyncCode().length >= 4) {
          await pullSync(true);
          scheduleSyncPush();
        }
        return true;
      } catch(e) {
        if (!silent) showStatus('Thất bại: '+e.message,'error');
        $('main-area').classList.add('hidden'); setConnectedUI(false); return false;
      }
    }

    function updateUploadButton() {
      $('btn-upload').disabled = !selectedFiles.length;
      $('upload-zone').querySelector('p').innerHTML = selectedFiles.length
        ? 'Đã chọn <strong>'+selectedFiles.length+'</strong> file' : 'Kéo thả hoặc <strong>chạm để chọn</strong>';
    }

    // Events
    const uz=$('upload-zone'), fi=$('file-input');
    uz.onclick=()=>fi.click();
    uz.ondragover=e=>{e.preventDefault();uz.classList.add('dragover');};
    uz.ondragleave=()=>uz.classList.remove('dragover');
    uz.ondrop=e=>{e.preventDefault();uz.classList.remove('dragover');selectedFiles=Array.from(e.dataTransfer.files);updateUploadButton();};
    fi.onchange=()=>{selectedFiles=Array.from(fi.files);updateUploadButton();};

    $('btn-connect').onclick=()=>connect(false);
    $('btn-save').onclick=saveConfig;
    $('app-password').addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').slice(0, getPinLen());
    });
    $('btn-upload').onclick=uploadFiles;
    $('btn-refresh').onclick=async()=>{
      const btn=$('btn-refresh');
      const icon=btn.querySelector('i');
      if(icon){icon.classList.add('fa-spin');}
      btn.disabled=true;
      try{await listFiles();showStatus('Đã làm mới','success');}
      finally{btn.disabled=false;if(icon)icon.classList.remove('fa-spin');}
    };
    $('btn-sync').onclick=()=>fullSync();
    $('btn-new-folder').onclick=createFolder;
    $('btn-batch-delete').onclick=batchDelete;
    $('btn-batch-clear').onclick=()=>{selectedPaths.clear();document.querySelectorAll('.file-check').forEach(c=>c.checked=false);document.querySelectorAll('.file-item').forEach(e=>e.classList.remove('selected'));updateBatchBar();};
    $('search-input').oninput=()=>applySearch(true);
    $('page-prev').onclick=()=>goPage(-1);
    $('page-next').onclick=()=>goPage(1);
    $('btn-view-list').onclick=()=>setViewMode('list');
    $('btn-view-grid').onclick=()=>setViewMode('grid');
    $('btn-filter-star').onclick=toggleStarFilter;
    $('btn-play-all').onclick=()=>playAll(false);
    $('btn-shuffle-all').onclick=()=>playAll(true);
    $('btn-sleep').onclick=pickSleep;
    $('config-header').onclick=e=>{if(e.target.closest('input,button.btn'))return;toggleConfig();};
    $('config-toggle').onclick=e=>{e.stopPropagation();toggleConfig();};
    ['username','repo','token'].forEach(id=>$(id).onkeypress=e=>{if(e.key==='Enter')connect(false);});

    let appStarted = false;
    async function startApp() {
      if (appStarted) return;
      appStarted = true;
      const has = loadConfig();
      setViewMode(localStorage.getItem('gh-view-mode') || 'list');
      if (localStorage.getItem('gh-config-collapsed') === '1') {
        configCollapsed = false;
        toggleConfig();
      }
      if (has && config.username && config.repo && config.token) {
        loadFavorites();
        await connect(true);
      }
    }
    (async function init() {
      if (!checkLock()) return; // đang hiện màn khóa → chờ tryUnlock gọi startApp
      await startApp();
    })();
