/**
 * Perf boost - chạy global qua head.ejs (defer)
 * - Prefetch trang khi hover link (cảm giác click instant khi chuyển trang)
 * - Lazy load image không có loading="lazy" attribute
 * - Cancel idle work khi user scroll
 */
(function(){
  'use strict';

  // ════════════ 1. LINK PREFETCH ON HOVER ════════════
  // Khi user hover/focus link nội bộ → fetch HTML trước → click thấy instant
  var __prefetched = new Set();
  var __prefetchSupported = (function(){
    var l = document.createElement('link');
    return l.relList && l.relList.supports && l.relList.supports('prefetch');
  })();

  function prefetchUrl(url){
    if (!__prefetchSupported) return;
    if (__prefetched.has(url)) return;
    __prefetched.add(url);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
  }

  function isInternalLink(a){
    if (!a || !a.href) return false;
    if (a.target === '_blank') return false;
    if (a.hasAttribute('download')) return false;
    try {
      var u = new URL(a.href);
      if (u.origin !== location.origin) return false;
      // Skip API/static/uploads
      if (/^\/(api|static|uploads|sw\.js|manifest)/.test(u.pathname)) return false;
      // Skip current page
      if (u.pathname === location.pathname && u.search === location.search) return false;
      return true;
    } catch(e){ return false; }
  }

  // Throttle: prefetch khi user hover > 65ms (intent thật, không phải lướt qua)
  var hoverTimer = null;
  document.addEventListener('mouseover', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !isInternalLink(a)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function(){ prefetchUrl(a.href); }, 65);
  }, { passive: true });

  document.addEventListener('mouseout', function(){
    clearTimeout(hoverTimer);
  }, { passive: true });

  // Touch devices: prefetch ngay khi touchstart (instant)
  document.addEventListener('touchstart', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && isInternalLink(a)) prefetchUrl(a.href);
  }, { passive: true });

  // ════════════ 2. AUTO LAZY-LOAD IMAGES ════════════
  // Set loading="lazy" cho mọi <img> không có attr (trừ logo/banner trên fold đầu)
  function autoLazy(){
    var imgs = document.querySelectorAll('img:not([loading]):not([data-eager])');
    imgs.forEach(function(img){
      // Skip ảnh ở viewport trên cùng (logo header, banner hero)
      var rect = img.getBoundingClientRect();
      if (rect.top < window.innerHeight) return;  // visible đầu page → load eager
      img.loading = 'lazy';
      img.decoding = 'async';
    });
  }
  // Chạy sau khi DOM ready + observe mutation (khi load card mới)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoLazy);
  } else {
    autoLazy();
  }
  // Re-apply khi có node mới add (ví dụ load room list, chat)
  var lazyTimer = null;
  var mo = new MutationObserver(function(){
    clearTimeout(lazyTimer);
    lazyTimer = setTimeout(autoLazy, 300);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // ════════════ 3. IDLE WORK + REQUEST IDLE CALLBACK SHIM ════════════
  // Polyfill cho Safari/old Firefox
  window.__ric = window.requestIdleCallback || function(cb){
    return setTimeout(function(){
      cb({ timeRemaining: function(){ return 50; }, didTimeout: false });
    }, 1);
  };

  // ════════════ 4. SMOOTH PAGE NAV (chống flash trắng khi click link) ════════════
  // Click link nội bộ → fade-out body nhẹ trước khi nav (cảm giác mượt)
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !isInternalLink(a)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // Subtle opacity dip (~80ms) - không gây delay vì transitionend không block
    document.documentElement.style.transition = 'opacity 0.12s ease-out';
    document.documentElement.style.opacity = '0.85';
  }, true);
  // Reset khi pageshow (back/forward)
  window.addEventListener('pageshow', function(){
    document.documentElement.style.opacity = '1';
  });

  // ════════════ 5. SCROLL OPTIMIZATION ════════════
  // Disable expensive animations khi scrolling (vd hero shimmer, gradient)
  var scrollTimer = null;
  var isScrolling = false;
  window.addEventListener('scroll', function(){
    if (!isScrolling) {
      document.documentElement.classList.add('is-scrolling');
      isScrolling = true;
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function(){
      document.documentElement.classList.remove('is-scrolling');
      isScrolling = false;
    }, 150);
  }, { passive: true });
})();
