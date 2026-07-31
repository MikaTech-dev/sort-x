/**
 * content.js — Runs in the ISOLATED world (content script context).
 * Receives intercepted user data from inject.js via postMessage,
 * buffers it, and provides the sort UI (floating button + sort panel).
 */
(function () {
  'use strict';

  // Inject page-context script (Fallback for MAIN world)
  try {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = function () { s.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}

  // State
  const state = {
    followers: new Map(),   // id -> user
    following: new Map(),   // id -> user
    followersTotal: null,   // total followers_count
    followingTotal: null,   // total friends_count
    currentPage: null,      // 'followers' | 'following' | null
    isAutoScrolling: false,
    panelVisible: false,
    sortOrder: 'desc',      // 'desc' = most followers first
    searchQuery: '',
  };

  // Utilities
  function formatCount(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return (v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')) + 'M';
    }
    if (n >= 1_000) {
      const v = n / 1_000;
      return (v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')) + 'K';
    }
    return n.toLocaleString();
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function detectPageType() {
    const p = window.location.pathname.toLowerCase();
    if (p.includes('/followers') || p.includes('/verified_followers') || p.includes('/followers_you_follow')) {
      return 'followers';
    }
    if (p.includes('/following')) {
      return 'following';
    }
    return null;
  }

  function getBuffer() {
    var page = state.currentPage || detectPageType() || 'following';
    return page === 'followers' ? state.followers : state.following;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // Data handling
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== '__sortx_data') return;

    var users = event.data.users || [];
    var source = event.data.source;
    var pageType = detectPageType();

    if (!pageType) {
      pageType = source === 'followers' ? 'followers' : 'following';
    }

    if (event.data.followersTotal != null && event.data.followersTotal > 0) {
      state.followersTotal = event.data.followersTotal;
    }
    if (event.data.followingTotal != null && event.data.followingTotal > 0) {
      state.followingTotal = event.data.followingTotal;
    }
    if (event.data.totalCount != null && event.data.totalCount > 0) {
      state.followingTotal = event.data.totalCount;
    }

    var buffer = pageType === 'followers' ? state.followers : state.following;

    for (var i = 0; i < users.length; i++) {
      var user = users[i];
      var key = user.id || user.screenName;
      if (!key) continue;
      buffer.set(key, user);
    }

    updateCountBadge();
  });

  // Floating Action Button (FAB)
  var fab = null;

  function createFAB() {
    if (fab) return;

    fab = document.createElement('div');
    fab.id = 'sortx-fab';
    fab.innerHTML =
      '<button class="sortx-fab-main" id="sortx-fab-btn">' +
        '<svg class="sortx-fab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<line x1="4" y1="6" x2="18" y2="6"/>' +
          '<line x1="4" y1="12" x2="14" y2="12"/>' +
          '<line x1="4" y1="18" x2="10" y2="18"/>' +
        '</svg>' +
        '<span class="sortx-fab-text">Sort</span>' +
        '<span class="sortx-fab-count" id="sortx-count">0</span>' +
      '</button>' +
      '<button class="sortx-fab-secondary" id="sortx-autoscroll" title="Auto-scroll to load all users">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 5v14"/>' +
          '<path d="M19 12l-7 7-7-7"/>' +
        '</svg>' +
      '</button>';

    document.body.appendChild(fab);

    document.getElementById('sortx-fab-btn').addEventListener('click', function () {
      showSortPanel();
    });

    document.getElementById('sortx-autoscroll').addEventListener('click', toggleAutoScroll);
    updateCountBadge();
  }

  function removeFAB() {
    if (fab) {
      fab.remove();
      fab = null;
    }
  }

  function getTotalCount() {
    var page = state.currentPage || detectPageType() || 'following';
    return page === 'followers' ? state.followersTotal : state.followingTotal;
  }

  function updateCountBadge() {
    var buffer = getBuffer();
    if (!fab) return;

    var el = document.getElementById('sortx-count');
    if (!el) return;

    var count = buffer ? buffer.size : 0;
    el.textContent = String(count);

    if (state.panelVisible) {
      var subtitle = document.getElementById('sortx-panel-subtitle');
      if (subtitle) {
        subtitle.textContent = buildSubtitle(buffer);
      }
      renderSortedList();
    }
  }

  function buildSubtitle(buffer) {
    var count = buffer ? buffer.size : 0;
    return count + ' accounts loaded · sorted by followers';
  }

  // Sort Panel (Modal Overlay)
  var panel = null;

  function showSortPanel() {
    state.panelVisible = true;
    state.searchQuery = '';

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sortx-panel';
      document.body.appendChild(panel);
    }

    renderPanel();
    requestAnimationFrame(function () {
      panel.classList.add('sortx-visible');
    });
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onPanelKeyDown);
  }

  function closeSortPanel() {
    state.panelVisible = false;
    state.searchQuery = '';
    if (panel) panel.classList.remove('sortx-visible');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onPanelKeyDown);
  }

  function onPanelKeyDown(e) {
    if (e.key === 'Escape') closeSortPanel();
  }

  var VERIFIED_SVG =
    '<svg class="sortx-verified-badge" viewBox="0 0 22 22" width="18" height="18">' +
    '<path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246' +
    '.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882' +
    '-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646' +
    '.017-1.273.213-1.813.568s-.969.855-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22' +
    '.436-1.69.882-.445.47-.749 1.055-.878 1.69-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443' +
    ' 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224' +
    '.606-.274 1.263-.144 1.896.13.636.433 1.221.878 1.69.47.446 1.055.752 1.69.883.635.13 1.294' +
    '.083 1.902-.143.271.586.702 1.084 1.24 1.438.54.354 1.167.551 1.813.568.647-.016 1.276-.213' +
    ' 1.817-.567s.972-.854 1.245-1.44c.604.225 1.261.272 1.893.143.636-.131 1.22-.437 1.69-.882' +
    '.445-.47.75-1.055.88-1.69.131-.634.084-1.292-.139-1.9.585-.273 1.084-.704 1.438-1.244.354-.54' +
    '.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"' +
    ' fill="#1D9BF0"/></svg>';

  function renderPanel() {
    var buffer = getBuffer();
    if (!panel) return;

    var pageType = state.currentPage || detectPageType();
    var label = pageType === 'followers' ? 'Followers' : 'Following';
    var descArrow = state.sortOrder === 'desc'
      ? '<path d="M12 5v14"/><path d="M5 12l7 7 7-7"/>'
      : '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>';
    var orderLabel = state.sortOrder === 'desc' ? 'Most first' : 'Least first';

    panel.innerHTML =
      '<div class="sortx-backdrop" id="sortx-backdrop"></div>' +
      '<div class="sortx-modal">' +
        '<header class="sortx-header">' +
          '<div class="sortx-header-top">' +
            '<div class="sortx-header-left">' +
              '<h2 class="sortx-title">' + label + '</h2>' +
              '<span class="sortx-subtitle" id="sortx-panel-subtitle">' +
                buildSubtitle(buffer) +
              '</span>' +
            '</div>' +
            '<button class="sortx-close" id="sortx-close" aria-label="Close">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<line x1="18" y1="6" x2="6" y2="18"/>' +
                '<line x1="6" y1="6" x2="18" y2="18"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="sortx-toolbar">' +
            '<div class="sortx-search-box">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<circle cx="11" cy="11" r="8"/>' +
                '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
              '</svg>' +
              '<input type="text" id="sortx-search" class="sortx-search-input" placeholder="Search by name or handle…" autocomplete="off">' +
            '</div>' +
            '<button class="sortx-order-btn" id="sortx-order" title="Toggle sort direction">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                descArrow +
              '</svg>' +
              '<span>' + orderLabel + '</span>' +
            '</button>' +
          '</div>' +
        '</header>' +
        '<div class="sortx-list" id="sortx-list"></div>' +
      '</div>';

    document.getElementById('sortx-backdrop').addEventListener('click', closeSortPanel);
    document.getElementById('sortx-close').addEventListener('click', closeSortPanel);
    document.getElementById('sortx-order').addEventListener('click', function () {
      state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
      renderPanel();
    });

    var searchInput = document.getElementById('sortx-search');
    searchInput.addEventListener('input', function (e) {
      state.searchQuery = e.target.value;
      renderSortedList();
    });
    setTimeout(function () { searchInput.focus(); }, 100);

    renderSortedList();
  }

  function renderSortedList() {
    var listEl = document.getElementById('sortx-list');
    if (!listEl) return;

    var buffer = getBuffer();
    var users = buffer ? Array.from(buffer.values()) : [];

    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      users = users.filter(function (u) {
        return (
          (u.name && u.name.toLowerCase().indexOf(q) !== -1) ||
          (u.screenName && u.screenName.toLowerCase().indexOf(q) !== -1) ||
          (u.bio && u.bio.toLowerCase().indexOf(q) !== -1)
        );
      });
    }

    var dir = state.sortOrder === 'desc' ? -1 : 1;
    users.sort(function (a, b) {
      return (a.followersCount - b.followersCount) * dir;
    });

    var fragment = document.createDocumentFragment();

    if (users.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'sortx-empty';
      empty.textContent = state.searchQuery
        ? 'No matching users found.'
        : 'No accounts captured yet. Scroll down the page to trigger network requests.';
      fragment.appendChild(empty);
    } else {
      for (var i = 0; i < users.length; i++) {
        fragment.appendChild(createCard(users[i], i + 1));
      }
    }

    listEl.innerHTML = '';
    listEl.appendChild(fragment);
  }

  function createCard(user, rank) {
    var card = document.createElement('a');
    card.className = 'sortx-card';
    card.href = 'https://x.com/' + encodeURIComponent(user.screenName);
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    var isSquare = user.profileImageShape === 'Square';
    var rankClass = rank <= 3 ? ' sortx-rank-top' : '';
    var fallbackAvatar =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect fill='%23333' width='48' height='48' rx='24'/%3E%3C/svg%3E";

    card.innerHTML =
      '<span class="sortx-rank' + rankClass + '">#' + rank + '</span>' +
      '<div class="sortx-avatar-wrap">' +
        '<img class="sortx-avatar' + (isSquare ? ' sortx-avatar-sq' : '') + '" ' +
          'src="' + escapeHtml(user.avatarUrl) + '" alt="" loading="lazy" ' +
          'onerror="this.src=\'' + fallbackAvatar + '\'">' +
      '</div>' +
      '<div class="sortx-info">' +
        '<div class="sortx-name-row">' +
          '<span class="sortx-name">' + escapeHtml(user.name) + '</span>' +
          (user.isVerified ? VERIFIED_SVG : '') +
          (user.isFollowingYou
            ? '<span class="sortx-follows-you">Follows you</span>'
            : '') +
        '</div>' +
        '<span class="sortx-handle">@' + escapeHtml(user.screenName) + '</span>' +
        (user.bio
          ? '<p class="sortx-bio">' + escapeHtml(user.bio) + '</p>'
          : '') +
      '</div>' +
      '<div class="sortx-stats">' +
        '<div class="sortx-stat">' +
          '<strong>' + formatCount(user.followersCount) + '</strong>' +
          '<span>followers</span>' +
        '</div>' +
        '<div class="sortx-stat">' +
          '<strong>' + formatCount(user.followingCount) + '</strong>' +
          '<span>following</span>' +
        '</div>' +
      '</div>';

    return card;
  }

  // Auto-scroll
  function toggleAutoScroll() {
    if (state.isAutoScrolling) {
      state.isAutoScrolling = false;
    } else {
      startAutoScroll();
    }
  }

  async function startAutoScroll() {
    state.isAutoScrolling = true;

    var btn = document.getElementById('sortx-autoscroll');
    if (btn) btn.classList.add('sortx-scrolling');

    var fabText = fab ? fab.querySelector('.sortx-fab-text') : null;
    if (fabText) fabText.textContent = 'Loading…';

    var buffer = getBuffer();
    var prevSize = buffer ? buffer.size : 0;
    var prevScrollPos = -1;
    var staleRounds = 0;
    var atBottomRounds = 0;

    while (state.isAutoScrolling) {
      window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);

      await sleep(1200);

      var currentSize = buffer ? buffer.size : 0;
      var currentScrollPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      var maxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;

      var isAtBottom = currentScrollPos >= maxScroll - 150;

      if (isAtBottom) {
        atBottomRounds++;
      } else {
        atBottomRounds = 0;
      }

      if (currentSize === prevSize && (isAtBottom || Math.abs(currentScrollPos - prevScrollPos) < 10)) {
        staleRounds++;
      } else {
        staleRounds = 0;
        prevSize = currentSize;
        prevScrollPos = currentScrollPos;
      }

      if (atBottomRounds >= 3 || staleRounds >= 4) {
        break;
      }
    }

    state.isAutoScrolling = false;
    if (btn) btn.classList.remove('sortx-scrolling');
    if (fabText) fabText.textContent = 'Sort';
  }

  // SPA Navigation Detection
  function handlePageChange() {
    var newPage = detectPageType();

    if (newPage !== state.currentPage) {
      closeSortPanel();
      state.isAutoScrolling = false;
      state.currentPage = newPage;

      if (newPage) {
        createFAB();
        updateCountBadge();
      } else {
        removeFAB();
      }
    } else if (newPage && !fab) {
      createFAB();
      updateCountBadge();
    }
  }

  var lastHref = location.href;
  var navObserver = new MutationObserver(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      handlePageChange();
    }
  });

  function init() {
    navObserver.observe(document.body, { childList: true, subtree: true });
    handlePageChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
