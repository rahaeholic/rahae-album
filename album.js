// 아래 dock: 첫 화면의 두 문이 지나가면 보이고, 지금 영상 쪽인지 사진 쪽인지 표시합니다.
(function () {
  'use strict';
  var dock = document.querySelector('.dock');
  if (!dock) return;
  var root = document.documentElement;
  var doors = document.querySelector('.jump');
  var photosEl = document.getElementById('photos');
  if (!('IntersectionObserver' in window) || !doors) { root.classList.add('dock-on'); return; }

  new IntersectionObserver(function (entries) {
    root.classList.toggle('dock-on', !entries[entries.length - 1].isIntersecting);
  }).observe(doors);

  if (!photosEl) return;
  var links = Array.prototype.slice.call(dock.querySelectorAll('a[data-dock]'));
  var mark = function (where) {
    links.forEach(function (a) {
      if (a.getAttribute('data-dock') === where) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };
  // 화면 가운데 줄에 사진 섹션이 걸치면 사진, 그 위면 영상, 그 아래(저장·크레딧)는 표시 없음
  // rootMargin %는 화면 폭 기준이라, 화면 높이로 px 값을 계산해 세로 가운데 1px 줄을 만듭니다.
  var centerIo = null;
  var watchCenter = function () {
    if (centerIo) centerIo.disconnect();
    var h = Math.max(1, Math.floor(window.innerHeight || root.clientHeight || 1));
    var top = Math.floor((h - 1) / 2), bottom = h - top - 1;
    centerIo = new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      mark(en.isIntersecting ? 'photos' : (en.boundingClientRect.top > 0 ? 'video' : ''));
    }, { rootMargin: '-' + top + 'px 0px -' + bottom + 'px 0px' });
    centerIo.observe(photosEl);
  };
  watchCenter();
  window.addEventListener('resize', watchCenter);
  window.addEventListener('orientationchange', watchCenter);
})();

// 사진 앨범: album.json으로 장면별 목록을 채우고, 누르면 크게 봅니다.
// 목록은 장면마다 12장씩 먼저 그리고 24장씩 더 보며, 큰보기는 album.json의 photos 순서(1..N)로만 넘깁니다.
(function () {
  'use strict';
  var PAGE = 12, STEP = 24, SLOW = 800, STALL = 10000;
  var section = document.getElementById('photos');
  if (!section) return;
  var dialog = document.getElementById('viewer');
  var canView = !!(dialog && typeof dialog.showModal === 'function');
  var listLive = section.querySelector('.photos-live');

  var photos = [];                 // 공개 사진, 보여줄 순서대로
  var byId = Object.create(null);  // "012" -> photos index
  var groups = Object.create(null);
  var order = [];
  var loaded = false, loading = false, offered = false, retryFrom = null;
  var req = 0, ctrl = null, slowTimer = 0, stallTimer = 0;

  // 정적 HTML의 장면 section을 기준으로 묶음을 만듭니다.
  Array.prototype.forEach.call(section.querySelectorAll('.chapter[data-group]'), function (el) {
    var id = el.getAttribute('data-group');
    var h = el.querySelector('h3');
    groups[id] = {
      el: el, title: h ? h.textContent : '', items: [], shown: 0,
      list: el.querySelector('.rows'), foot: el.querySelector('.chapter-foot'), status: null
    };
    order.push(id);
  });

  // 같은 문장도 다시 읽히도록 한 번 비우고 씁니다.
  var sayToken = 0;
  function say(text) {
    if (!listLive) return;
    var t = ++sayToken;
    listLive.textContent = '';
    setTimeout(function () { if (t === sayToken) listLive.textContent = text; }, 60);
  }

  /* ---------- 목록 ---------- */

  function load() {
    if (loaded) return;
    if (ctrl) ctrl.abort();
    var t = ++req;
    loading = true;
    section.setAttribute('aria-busy', 'true');
    allStatus(offered ? 'retrying' : 'loading');
    clearTimeout(slowTimer);
    clearTimeout(stallTimer);
    if (!offered) slowTimer = setTimeout(function () { if (t === req && loading) allStatus('slow'); }, SLOW);
    stallTimer = setTimeout(function () {
      if (t !== req || !loading) return;
      offered = true;
      allStatus('stalled');
      say('사진 목록이 늦어지고 있어요. 다시 시도할 수 있어요.');
    }, STALL);
    ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    fetch('album.json', ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (t !== req) return;  // 다시 시도로 새 요청이 나간 뒤 도착한 옛 응답
      finish();
      build(data);
    }).catch(function () {
      if (t !== req) return;
      finish();
      offered = true;
      allStatus('failed');
      say('사진 목록을 불러오지 못했어요. 다시 시도를 눌러 주세요.');
    });
  }

  function finish() {
    loading = false;
    ctrl = null;
    clearTimeout(slowTimer);
    clearTimeout(stallTimer);
    section.removeAttribute('aria-busy');
  }

  var LIST_TEXT = {
    loading: '',
    slow: '사진을 불러오는 중이에요.',
    stalled: '연결이 느려요. 조금 더 기다리거나 다시 시도해 주세요.',
    failed: '사진 목록을 불러오지 못했어요.',
    retrying: '다시 불러오는 중이에요.'
  };

  function allStatus(state) { order.forEach(function (id) { setListStatus(id, state); }); }

  // 상태 문구와 버튼은 장면마다 하나만 만들어 계속 씁니다. 다시 시도 중에도 버튼이 사라지지 않아 초점이 남습니다.
  function setListStatus(id, state) {
    var g = groups[id];
    if (!g.foot) return;
    if (!state) {
      if (g.status) { g.status.parentNode.removeChild(g.status); g.status = null; }
      g.list.removeAttribute('data-state');
      return;
    }
    if (!g.status) {
      var p = document.createElement('p');
      p.className = 'list-status';
      var span = document.createElement('span');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '다시 시도';
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-disabled') === 'true') return;
        retryFrom = id;
        load();
      });
      p.appendChild(span);
      p.appendChild(b);
      g.foot.insertBefore(p, g.foot.firstChild);
      g.status = p;
    }
    g.list.setAttribute('data-state', state);
    g.status.firstChild.textContent = LIST_TEXT[state];
    g.status.hidden = state === 'loading';
    var btn = g.status.lastChild;
    btn.hidden = !(state === 'stalled' || state === 'failed' || state === 'retrying');
    if (state === 'retrying') btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }

  function build(data) {
    var list = data && Array.isArray(data.photos) ? data.photos.slice() : [];
    list.sort(function (a, b) { return (a && a.number) - (b && b.number); });
    list.forEach(function (p) {
      if (!p || typeof p.id !== 'string' || !/^\d{3}$/.test(p.id) || p.id in byId) return;
      if (!groups[p.group] || typeof p.src !== 'string' || typeof p.thumb !== 'string') return;
      byId[p.id] = photos.length;
      groups[p.group].items.push(photos.length);
      photos.push(p);
    });
    loaded = true;

    // 상태 버튼을 지우기 전에 초점이 거기 있었는지 봅니다.
    var ae = document.activeElement;
    var focusGroup = retryFrom;
    if (!focusGroup && ae && ae.closest) {
      var st = ae.closest('.list-status');
      var ch = st && st.closest('.chapter[data-group]');
      if (ch) focusGroup = ch.getAttribute('data-group');
    }
    retryFrom = null;
    order.forEach(function (id) { setListStatus(id, null); render(id, PAGE); });
    if (offered) say('사진 목록을 불러왔어요.');
    offered = false;

    if (focusGroup && groups[focusGroup]) {
      var a = groups[focusGroup].list.querySelector('a') || groups[focusGroup].el.querySelector('.to-film');
      if (a) a.focus();
    }
    // 목록이 채워져 위치가 밀렸을 수 있으므로 주소의 위치로 다시 맞춥니다.
    var h = location.hash;
    if (/^#photo-/.test(h)) { if (canView) syncFromHash(); }
    else if (/^#photos-/.test(h)) {
      var target = document.getElementById(h.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  function render(id, upto) {
    var g = groups[id];
    var end = Math.min(upto, g.items.length);
    var frag = document.createDocumentFragment();
    var first = null;
    for (var k = g.shown; k < end; k++) {
      var li = item(g.items[k]);
      if (!first) first = li;
      frag.appendChild(li);
    }
    g.list.appendChild(frag);
    if (end > g.shown) g.shown = end;
    updateMore(id);
    return first;
  }

  // 펼친 장수가 언제나 12, 36, 60…처럼 같은 단계에 맞도록 pos번째(0부터)까지 보이는 끝을 계산합니다.
  function stepEnd(pos) {
    return pos < PAGE ? PAGE : PAGE + Math.ceil((pos + 1 - PAGE) / STEP) * STEP;
  }

  function item(i) {
    var p = photos[i];
    var tw = +p.thumbWidth || 4, th = +p.thumbHeight || 3;
    var li = document.createElement('li');
    li.style.setProperty('--r', (tw / th).toFixed(4));
    var a = document.createElement('a');
    a.href = p.src;
    a.setAttribute('data-index', i);
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = tw;
    img.height = th;
    img.alt = p.alt || '';
    img.src = p.thumb;
    a.appendChild(img);
    li.appendChild(a);
    return li;
  }

  function more(id) {
    var g = groups[id];
    var before = g.shown;
    var li = render(id, g.shown + STEP);
    if (!li) return;
    li.firstChild.focus();
    say(g.title + ' 사진 ' + (g.shown - before) + '장 추가, 모두 ' + g.items.length + '장 중 ' + g.shown + '장');
  }

  function updateMore(id) {
    var g = groups[id];
    if (!g.foot) return;
    var btn = g.foot.querySelector('.more');
    var rest = g.items.length - g.shown;
    if (rest <= 0) {
      if (btn) btn.parentNode.removeChild(btn);
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'more';
      btn.setAttribute('aria-controls', g.list.id);
      btn.addEventListener('click', function () { more(id); });
      g.foot.appendChild(btn);
    }
    btn.textContent = '';
    if (rest > STEP) {
      var w = document.createElement('span');
      w.textContent = STEP + '장 더 보기';
      var c = document.createElement('span');
      c.className = 'more-c';
      c.textContent = '남은 ' + rest + '장';
      btn.appendChild(w);
      btn.appendChild(c);
    } else {
      btn.textContent = '나머지 ' + rest + '장 보기';
    }
  }

  /* ---------- 장면 바 ---------- */

  var barLinks = Array.prototype.slice.call(section.querySelectorAll('.chapter-bar a'));
  function markChapter(id) {
    barLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + id) {
        a.setAttribute('aria-current', 'true');
        var ul = a.parentNode.parentNode;
        var x = a.parentNode.offsetLeft - ul.offsetLeft;
        if (x < ul.scrollLeft || x + a.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = x - 16;
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }
  if ('IntersectionObserver' in window) {
    // 화면 높이의 30%~40% 줄(최소 1px)에 걸친 장면을 현재로 봅니다. 높이가 바뀌면 다시 만듭니다.
    var io = null;
    var watchChapters = function () {
      if (io) io.disconnect();
      var h = Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 1));
      var top = Math.min(h - 1, Math.floor(h * 0.3));
      var bottom = Math.max(0, h - Math.max(top + 1, Math.floor(h * 0.4)));
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) markChapter(en.target.id); });
      }, { rootMargin: '-' + top + 'px 0px -' + bottom + 'px 0px' });
      order.forEach(function (id) { io.observe(groups[id].el); });
    };
    watchChapters();
    window.addEventListener('resize', watchChapters);
    window.addEventListener('orientationchange', watchChapters);
  }

  /* ---------- 큰보기 ---------- */

  section.addEventListener('click', function (e) {
    if (!canView || !loaded || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;  // 새 탭 등은 원래 링크대로
    var a = e.target.closest ? e.target.closest('a[data-index]') : null;
    if (!a || !section.contains(a)) return;
    var i = +a.getAttribute('data-index');
    if (!photos[i]) return;
    e.preventDefault();
    open(i, false);
  });

  if (canView) {
    var img = dialog.querySelector('.viewer-img');
    var stage = dialog.querySelector('.viewer-stage');
    var jump = dialog.querySelector('.viewer-chapter');
    var countEl = dialog.querySelector('.viewer-count');
    var closeBtn = dialog.querySelector('.viewer-close');
    var saveLink = dialog.querySelector('.viewer-save');
    var statusEl = dialog.querySelector('.viewer-status');
    var statusText = statusEl.querySelector('span');
    var retryBtn = statusEl.querySelector('button');
    var live = dialog.querySelector('.viewer-live');
    var prevBtns = dialog.querySelectorAll('[data-act="prev"]');
    var nextBtns = dialog.querySelectorAll('[data-act="next"]');
    var barPrev = dialog.querySelector('.viewer-bar [data-act="prev"]');
    var barNext = dialog.querySelector('.viewer-bar [data-act="next"]');

    var cur = -1, dir = 1, token = 0, viewSlowTimer = 0;
    var pushed = false, focusAfterPop = false;

    var open = function (i, fromHash) {
      if (!photos[i]) return;
      if (!dialog.open) {
        Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) { if (!v.paused) v.pause(); });
        pushed = false;
        if (!fromHash) {
          history.pushState({ rahaePhoto: true }, '', '#photo-' + photos[i].id);
          pushed = true;
        }
        document.documentElement.classList.add('viewer-open');
        dialog.showModal();
        closeBtn.focus();
      }
      show(i);
    };

    var show = function (i) {
      var p = photos[i];
      if (!p) return;
      cur = i;
      var t = ++token;
      clearTimeout(viewSlowTimer);
      var g = groups[p.group];
      var pos = g ? g.items.indexOf(i) : i;
      var total = g ? g.items.length : photos.length;

      img.width = +p.width || +p.thumbWidth || 0;
      img.height = +p.height || +p.thumbHeight || 0;
      img.alt = p.alt || '';
      img.src = p.thumb;  // 먼저 작은 사진, 큰 사진을 받으면 바꿉니다.
      if (jump && g) jump.value = p.group;
      countEl.textContent = (pos + 1) + ' / ' + total;
      saveLink.href = p.src;
      saveLink.setAttribute('download', 'rahae-50days-' + p.id + '.webp');
      setDisabled(prevBtns, i === 0);
      setDisabled(nextBtns, i === photos.length - 1);
      setStatus(null);
      live.textContent = (g ? g.title + ', ' : '') + total + '장 중 ' + (pos + 1) + '번째 사진';

      if (location.hash !== '#photo-' + p.id) history.replaceState(history.state, '', '#photo-' + p.id);

      var a = document.activeElement;
      if (a && a.disabled && dialog.contains(a)) {
        var other = a.getAttribute('data-act') === 'prev' ? barNext : barPrev;
        (other && !other.disabled ? other : closeBtn).focus();
      }
      fetchView(t, p, false);
    };

    var fetchView = function (t, p, again) {
      clearTimeout(viewSlowTimer);
      // 다시 시도 중에는 이미 '다시 불러오는 중' 문구와 버튼이 보이므로 덮어쓰지 않습니다.
      if (!again) viewSlowTimer = setTimeout(function () { if (t === token) setStatus('사진을 불러오는 중이에요', false); }, 350);
      var loader = new Image();
      loader.decoding = 'async';
      loader.onload = function () {
        if (t !== token) return;  // 이미 다른 사진으로 넘어감
        clearTimeout(viewSlowTimer);
        img.src = p.src;
        setStatus(null);
        if (again) live.textContent = '사진을 불러왔어요.';
        var n = photos[cur + dir];
        if (n) new Image().src = n.src;  // 넘기는 방향으로 한 장만 미리 받기
      };
      loader.onerror = function () {
        if (t !== token) return;
        clearTimeout(viewSlowTimer);
        var msg = again ? '다시 해 봤지만 불러오지 못했어요.' : '사진을 불러오지 못했어요.';
        setStatus(msg, true);
        live.textContent = msg + ' 다시 시도할 수 있어요.';
      };
      loader.src = p.src;
    };

    // 상태가 사라질 때 초점이 그 안(다시 시도)에 있었으면 보이는 버튼으로 옮깁니다.
    var setStatus = function (text, retry, busy) {
      if (!text) {
        var had = statusEl.contains(document.activeElement);
        statusEl.hidden = true;
        retryBtn.removeAttribute('aria-disabled');
        if (had && dialog.open) {
          var to = !barNext.disabled ? barNext : !barPrev.disabled ? barPrev : closeBtn;
          to.focus();
        }
        return;
      }
      statusText.textContent = text;
      retryBtn.hidden = !retry;
      if (busy) retryBtn.setAttribute('aria-disabled', 'true');
      else retryBtn.removeAttribute('aria-disabled');
      statusEl.hidden = false;
    };

    var setDisabled = function (list, on) {
      Array.prototype.forEach.call(list, function (b) { b.disabled = on; });
    };

    var go = function (i, d) {
      if (cur < 0 || i < 0 || i >= photos.length || i === cur) return;
      dir = d;
      show(i);
    };

    // 장면 바로 가기: 고른 장면의 첫 사진으로
    if (jump) {
      jump.addEventListener('change', function () {
        var g = groups[jump.value];
        if (!g || !g.items.length || cur < 0) return;
        var i = g.items[0];
        go(i, i < cur ? -1 : 1);
      });
    }

    var returnFocus = function () {
      var p = photos[cur];
      var g = p && groups[p.group];
      if (!g) return;
      var pos = g.items.indexOf(cur);
      if (pos >= g.shown) render(p.group, stepEnd(pos));
      var a = g.list.querySelector('a[data-index="' + cur + '"]');
      if (!a) return;
      try { a.focus({ preventScroll: true }); } catch (err) { a.focus(); }
      a.scrollIntoView({ block: 'nearest' });
    };

    var isPhotoHash = function () { return /^#photo-/.test(location.hash); };

    // Esc, 닫기 버튼, 목록 버튼, 아래로 쓸기, 뒤로가기 모두 여기서 정리합니다.
    dialog.addEventListener('close', function () {
      token++;
      clearTimeout(viewSlowTimer);
      statusEl.hidden = true;
      img.removeAttribute('src');
      document.documentElement.classList.remove('viewer-open');
      var wasPushed = pushed;
      pushed = false;
      if (isPhotoHash()) {
        if (wasPushed) {
          focusAfterPop = true;
          history.back();
          return;
        }
        history.replaceState(null, '', location.pathname + location.search);
      }
      returnFocus();
    });

    var syncFromHash = function () {
      if (focusAfterPop) {
        focusAfterPop = false;
        setTimeout(returnFocus, 0);
      }
      var m = /^#photo-(\d{3})$/.exec(location.hash);
      var i = m && m[1] in byId ? byId[m[1]] : -1;
      if (i < 0) {  // 없는 사진이면 열지 않습니다.
        if (dialog.open) { pushed = false; dialog.close(); }
        return;
      }
      if (!loaded) return;
      if (dialog.open) { if (i !== cur) show(i); }
      else open(i, true);
    };
    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);

    dialog.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var el = e.target;
      // 장면 고르기 등 입력 요소를 조작할 때는 그 요소의 키 동작을 그대로 둡니다.
      if (el && (el.isContentEditable || /^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName))) return;
      if (e.key === 'ArrowLeft') go(cur - 1, -1);
      else if (e.key === 'ArrowRight') go(cur + 1, 1);
      else if (e.key === 'Home') go(0, -1);
      else if (e.key === 'End') go(photos.length - 1, 1);
      else return;
      e.preventDefault();
    });

    var lastPointer = '';
    dialog.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (b && dialog.contains(b)) {
        var act = b.getAttribute('data-act');
        if (act === 'prev') go(cur - 1, -1);
        else if (act === 'next') go(cur + 1, 1);
        else if (act === 'close') dialog.close();
        else if (act === 'retry') {
          if (b.getAttribute('aria-disabled') === 'true') return;
          setStatus('다시 불러오는 중이에요', true, true);
          fetchView(token, photos[cur], true);
        }
        return;
      }
      // 마우스로 사진 바깥 빈 곳을 누르면 닫습니다. 터치는 오작동을 막으려고 닫지 않습니다.
      if (lastPointer !== 'mouse') return;
      if (e.target === stage || (e.target === img && outsidePicture(e))) dialog.close();
    });

    // img는 무대를 꽉 채우고 contain으로 그리므로, 실제 사진 영역 밖(여백)을 눌렀는지 계산합니다.
    var outsidePicture = function (e) {
      var r = img.getBoundingClientRect();
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h || !r.width || !r.height) return false;
      var s = Math.min(r.width / w, r.height / h);
      var pw = w * s, ph = h * s;
      var x = e.clientX - r.left - (r.width - pw) / 2, y = e.clientY - r.top - (r.height - ph) / 2;
      return x < 0 || y < 0 || x > pw || y > ph;
    };

    // 스와이프: 한 손가락만, 확대 중에는 무시
    // 누른 포인터는 id로 기억하고, 무대 밖에서 떼거나 취소·닫힘·포커스 잃음에도 지워서 다음 쓸기가 막히지 않게 합니다.
    var sx = 0, sy = 0, down = Object.create(null), fingers = 0, tracking = false;
    var release = function (e) {
      if (e.pointerId in down) { delete down[e.pointerId]; fingers--; }
      if (!fingers) tracking = false;
    };
    var resetGesture = function () { down = Object.create(null); fingers = 0; tracking = false; };
    stage.addEventListener('pointerdown', function (e) {
      lastPointer = e.pointerType;
      if (e.pointerType === 'mouse') return;
      if (!(e.pointerId in down)) { down[e.pointerId] = true; fingers++; }
      tracking = fingers === 1 && e.isPrimary;
      sx = e.clientX;
      sy = e.clientY;
    });
    // 무대에서 뗀 것은 아래 무대 처리에서 이미 지웠으므로 window로 올라와도 다시 넘기지 않습니다.
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', resetGesture);
    dialog.addEventListener('close', resetGesture);
    stage.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'mouse') return;
      var wasTracking = tracking && (e.pointerId in down);
      release(e);
      if (!wasTracking || !e.isPrimary || !dialog.open) return;
      tracking = false;
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        if (dx < 0) go(cur + 1, 1); else go(cur - 1, -1);
      } else if (dy > 96 && dy > 1.5 * Math.abs(dx)) {
        dialog.close();
      }
    });
    stage.addEventListener('pointercancel', function (e) {
      if (e.pointerType === 'mouse') return;
      release(e);
      tracking = false;
    });
  }

  load();
})();
