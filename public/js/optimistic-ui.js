/* ╔══════════════════════════════════════════════════════════════════╗
   ║ 🚀 OPTIMISTIC UI helpers — Mục 14                                ║
   ║                                                                    ║
   ║ Pattern:                                                           ║
   ║   1. User click → UI update NGAY LẬP TỨC (dim/loading state)     ║
   ║   2. Background AJAX gửi server                                   ║
   ║   3a. Server OK → flash success + apply real state                ║
   ║   3b. Server FAIL → rollback UI + flash error                    ║
   ║                                                                    ║
   ║ API:                                                               ║
   ║   optimistic(el, fetchPromise, opts)                              ║
   ║   optimisticLike(btn, url)                                        ║
   ║   optimisticFollow(btn, idolId)                                   ║
   ║   optimisticChat(msgEl, sendPromise)                              ║
   ╚══════════════════════════════════════════════════════════════════*/
(function(){

  /**
   * Generic optimistic action
   * @param {HTMLElement} el - element to apply optimistic state
   * @param {Promise|Function} action - promise hoặc () => promise
   * @param {Object} opts - { onSuccess(data), onError(err), rollback() }
   */
  function optimistic(el, action, opts) {
    opts = opts || {};
    if (!el) return Promise.reject(new Error('No element'));

    var prevState = {
      text: el.textContent,
      innerHTML: el.innerHTML,
      disabled: el.disabled,
      classes: el.className
    };

    el.classList.add('x-optimistic');
    el.classList.remove('x-optimistic-success', 'x-optimistic-error');
    el.disabled = true;

    var promise;
    try {
      promise = typeof action === 'function' ? action() : action;
    } catch (e) {
      promise = Promise.reject(e);
    }
    if (!promise || !promise.then) promise = Promise.resolve(promise);

    return promise.then(function(data){
      el.classList.remove('x-optimistic');
      el.classList.add('x-optimistic-success');
      el.disabled = false;
      setTimeout(function(){ el.classList.remove('x-optimistic-success'); }, 600);
      if (opts.onSuccess) opts.onSuccess(data, el);
      return data;
    }).catch(function(err){
      el.classList.remove('x-optimistic');
      el.classList.add('x-optimistic-error');
      el.disabled = !!prevState.disabled;
      // Rollback
      if (opts.rollback) {
        try { opts.rollback(prevState, el); } catch(_){}
      } else {
        // Default: revert text + innerHTML
        if (prevState.innerHTML !== el.innerHTML) el.innerHTML = prevState.innerHTML;
      }
      setTimeout(function(){ el.classList.remove('x-optimistic-error'); }, 600);
      if (opts.onError) opts.onError(err, el);
      else console.warn('[optimistic] action failed:', err);
      throw err;
    });
  }

  /* ─── Like button (toggle ♥ + count update) ───
     Usage: <button data-like-url="/api/like/i1" data-liked="0">♥ <span class="cnt">12</span></button>
     Then: document.querySelectorAll('[data-like-url]').forEach(b => b.addEventListener('click', () => optimisticLike(b)));
  */
  function optimisticLike(btn) {
    var url = btn.getAttribute('data-like-url');
    if (!url) return;
    var wasLiked = btn.getAttribute('data-liked') === '1';
    var cntEl = btn.querySelector('.cnt, [data-cnt]');
    var prevCnt = cntEl ? parseInt(cntEl.textContent, 10) || 0 : 0;
    // OPTIMISTIC: toggle ngay
    btn.setAttribute('data-liked', wasLiked ? '0' : '1');
    if (cntEl) cntEl.textContent = wasLiked ? Math.max(0, prevCnt - 1) : (prevCnt + 1);
    btn.classList.toggle('is-liked', !wasLiked);
    return optimistic(btn,
      fetch(url, { method: 'POST', credentials: 'same-origin' }).then(function(r){
        if (!r.ok) throw new Error('Like fail');
        return r.json();
      }),
      {
        onSuccess: function(d) {
          // Sync với count thật từ server nếu trả về
          if (d && typeof d.count === 'number' && cntEl) cntEl.textContent = d.count;
        },
        rollback: function() {
          // Revert
          btn.setAttribute('data-liked', wasLiked ? '1' : '0');
          btn.classList.toggle('is-liked', wasLiked);
          if (cntEl) cntEl.textContent = prevCnt;
        }
      }
    );
  }

  /* ─── Follow button ─── */
  function optimisticFollow(btn) {
    var idolId = btn.getAttribute('data-follow-idol') || btn.getAttribute('data-idol-id');
    if (!idolId) return;
    var wasFollowing = btn.getAttribute('data-following') === '1';
    var newState = !wasFollowing;
    btn.setAttribute('data-following', newState ? '1' : '0');
    var prevText = btn.textContent;
    btn.textContent = newState ? 'Đang theo dõi' : 'Theo dõi';
    btn.classList.toggle('is-following', newState);
    return optimistic(btn,
      fetch('/api/follow/' + encodeURIComponent(idolId), {
        method: newState ? 'POST' : 'DELETE',
        credentials: 'same-origin'
      }).then(function(r){
        if (!r.ok) throw new Error('Follow fail');
        return r.json();
      }),
      {
        rollback: function() {
          btn.setAttribute('data-following', wasFollowing ? '1' : '0');
          btn.textContent = prevText;
          btn.classList.toggle('is-following', wasFollowing);
        }
      }
    );
  }

  /* ─── Chat message optimistic insert ───
     Usage: optimisticChat(msgElement, sendPromise) — msg đã insert vào DOM rồi
     Khi server reject → mark message với x-optimistic-error + dim
  */
  function optimisticChat(msgEl, sendPromise) {
    if (!msgEl) return Promise.reject(new Error('No msg element'));
    msgEl.classList.add('x-optimistic');
    return sendPromise.then(function(data) {
      msgEl.classList.remove('x-optimistic');
      msgEl.classList.add('x-optimistic-success');
      // Update msg ID nếu server trả về
      if (data && data.id) msgEl.setAttribute('data-msg-id', data.id);
      setTimeout(function(){ msgEl.classList.remove('x-optimistic-success'); }, 600);
      return data;
    }).catch(function(err) {
      msgEl.classList.remove('x-optimistic');
      msgEl.classList.add('x-optimistic-error');
      // Add retry button
      var retry = document.createElement('button');
      retry.className = 'ml-2 text-[10px] text-live underline';
      retry.textContent = 'Gửi lại';
      retry.onclick = function() {
        msgEl.classList.remove('x-optimistic-error');
        retry.remove();
        optimisticChat(msgEl, sendPromise);
      };
      msgEl.appendChild(retry);
      throw err;
    });
  }

  /* ─── Auto-binding cho các button có data-attr ─── */
  function autoBind() {
    // Like buttons
    document.querySelectorAll('[data-like-url]:not(.x-bound)').forEach(function(btn) {
      btn.classList.add('x-bound');
      btn.addEventListener('click', function(e){ e.preventDefault(); optimisticLike(btn); });
    });
    // Follow buttons
    document.querySelectorAll('[data-follow-idol]:not(.x-bound), [data-idol-id][data-action="follow"]:not(.x-bound)').forEach(function(btn) {
      btn.classList.add('x-bound');
      btn.addEventListener('click', function(e){ e.preventDefault(); optimisticFollow(btn); });
    });
  }
  if (document.readyState !== 'loading') autoBind();
  else document.addEventListener('DOMContentLoaded', autoBind);
  // Re-bind cho element insert động (chat messages, lazy load cards)
  if (window.MutationObserver) {
    new MutationObserver(function(){ autoBind(); }).observe(document.body, { childList: true, subtree: true });
  }

  /* ─── Expose globally ─── */
  window.x66Optimistic = {
    apply:   optimistic,
    like:    optimisticLike,
    follow:  optimisticFollow,
    chat:    optimisticChat,
    autoBind: autoBind
  };

})();
