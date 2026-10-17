// 사진 앨범: album.json으로 장면별 목록을 채우고, 누르면 크게 봅니다.
// 목록은 장면마다 12장씩 먼저 그리고, 큰보기는 album.json의 photos 순서(1..N)로만 넘깁니다.
(function () {
  'use strict';
  var PAGE = 12;
  var section = document.getElementById('photos');
  if (!section) return;
  var dialog = document.getElementById('viewer');
  var canView = !!(dialog && typeof dialog.showModal === 'function');

  var photos = [];                 // 공개 사진, 보여줄 순서대로
  var byId = Object.create(null);  // "012" -> photos index
  var groups = Object.create(null);
  var order = [];
  var loaded = false, loading = false, retryFrom = null;

  // 정적 HTML의 장면 section을 기준으로 묶음을 만듭니다.
  Array.prototype.forEach.call(section.querySelectorAll('.chapter[data-group]'), function (el) {
    var id = el.getAttribute('data-group');
    var h = el.querySelector('h3');
    groups[id] = {
      el: el, title: h ? h.textContent : '', items: [], shown: 0,
      list: el.querySelector('.rows'), foot: el.querySelector('.chapter-foot')
    };
    order.push(id);
  });

  /* ---------- 목록 ---------- */

  function load() {
    if (loading || loaded) return;
    loading = true;
    section.setAttribute('aria-busy', 'true');
    order.forEach(function (id) { setListStatus(id, false); });
    fetch('album.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      loading = false;
      section.removeAttribute('aria-busy');
      build(data);
    }).catch(function () {
      loading = false;
      section.removeAttribute('aria-busy');
      order.forEach(function (id) { setListStatus(id, true); });
    });
  }

  function setListStatus(id, failed) {
    var g = groups[id];
    if (!g.foot) return;
    var old = g.foot.querySelector('.list-status');
    if (old) old.parentNode.removeChild(old);
    if (!failed) return;
    var p = document.createElement('p');
    p.className = 'list-status';
    p.appendChild(document.createTextNode('사진 목록을 불러오지 못했어요.'));
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = '다시 시도';
    b.addEventListener('click', function () { retryFrom = id; load(); });
    p.appendChild(b);
    g.foot.appendChild(p);
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
    order.forEach(function (id) { render(id, PAGE); });

    if (retryFrom && groups[retryFrom]) {
      var a = groups[retryFrom].list.querySelector('a');
      if (a) a.focus();
      retryFrom = null;
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
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', g.list.id);
      btn.addEventListener('click', function () {
        var li = render(id, Infinity);
        if (li) li.firstChild.focus();
      });
      g.foot.appendChild(btn);
    }
    btn.textContent = '나머지 ' + rest + '장 펼치기';
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
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) markChapter(en.target.id); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    order.forEach(function (id) { io.observe(groups[id].el); });
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
    var titleEl = dialog.querySelector('.viewer-title');
    var countEl = dialog.querySelector('.viewer-count');
    var closeBtn = dialog.querySelector('.viewer-close');
    var saveLink = dialog.querySelector('.viewer-save');
    var statusEl = dialog.querySelector('.viewer-status');
    var statusText = statusEl.querySelector('span');
    var retryBtn = statusEl.querySelector('button');
    var live = dialog.querySelector('.viewer-live');
    var prevBtns = dialog.querySelectorAll('[data-act="prev"]');
    var nextBtns = dialog.querySelectorAll('[data-act="next"]');

    var cur = -1, dir = 1, token = 0, slowTimer = 0;
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
      clearTimeout(slowTimer);
      setStatus(null);
      var g = groups[p.group];

      img.width = +p.width || +p.thumbWidth || 0;
      img.height = +p.height || +p.thumbHeight || 0;
      img.alt = p.alt || '';
      img.src = p.thumb;  // 먼저 작은 사진, 큰 사진을 받으면 바꿉니다.
      titleEl.textContent = g ? g.title : '';
      countEl.textContent = (i + 1) + ' / ' + photos.length;
      saveLink.href = p.src;
      saveLink.setAttribute('download', 'rahae-50days-' + p.id + '.webp');
      setDisabled(prevBtns, i === 0);
      setDisabled(nextBtns, i === photos.length - 1);
      live.textContent = (g ? g.title + ', ' : '') + (i + 1) + '번째 사진, ' + photos.length + '장 중';

      if (location.hash !== '#photo-' + p.id) history.replaceState(history.state, '', '#photo-' + p.id);

      var a = document.activeElement;
      if (a && a.disabled && dialog.contains(a)) {
        var other = a.getAttribute('data-act') === 'prev' ? nextBtns[nextBtns.length - 1] : prevBtns[prevBtns.length - 1];
        (other && !other.disabled ? other : closeBtn).focus();
      }
      fetchView(t, p);
    };

    var fetchView = function (t, p) {
      clearTimeout(slowTimer);
      slowTimer = setTimeout(function () { if (t === token) setStatus('사진을 불러오는 중이에요', false); }, 350);
      var loader = new Image();
      loader.decoding = 'async';
      loader.onload = function () {
        if (t !== token) return;  // 이미 다른 사진으로 넘어감
        clearTimeout(slowTimer);
        img.src = p.src;
        setStatus(null);
        var n = photos[cur + dir];
        if (n) new Image().src = n.src;  // 넘기는 방향으로 한 장만 미리 받기
      };
      loader.onerror = function () {
        if (t !== token) return;
        clearTimeout(slowTimer);
        setStatus('사진을 불러오지 못했어요.', true);
      };
      loader.src = p.src;
    };

    var setStatus = function (text, retry) {
      if (!text) { statusEl.hidden = true; return; }
      statusText.textContent = text;
      retryBtn.hidden = !retry;
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

    var returnFocus = function () {
      var p = photos[cur];
      var g = p && groups[p.group];
      if (!g) return;
      if (g.items.indexOf(cur) >= g.shown) render(p.group, Infinity);
      var a = g.list.querySelector('a[data-index="' + cur + '"]');
      if (!a) return;
      try { a.focus({ preventScroll: true }); } catch (err) { a.focus(); }
      a.scrollIntoView({ block: 'nearest' });
    };

    var isPhotoHash = function () { return /^#photo-/.test(location.hash); };

    // Esc, 닫기 버튼, 아래로 쓸기, 뒤로가기 모두 여기서 정리합니다.
    dialog.addEventListener('close', function () {
      token++;
      clearTimeout(slowTimer);
      setStatus(null);
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
        else if (act === 'retry') { setStatus(null); fetchView(token, photos[cur]); }
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
