// Phone menu: the Escape key closes it. The menu is a plain <details> element, so it opens and closes
// without this script; this only adds Escape. Focus goes back to the Menu button when it was inside
// the menu (or nowhere in particular), so keyboard users don't lose their place.
(function () {
  'use strict';
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    var menu = document.querySelector('details.menu[open]');
    if (!menu) return;
    var active = document.activeElement;
    var returnFocus = !active || active === document.body || menu.contains(active);
    menu.open = false;
    if (returnFocus) menu.querySelector('summary').focus();
  });
})();

// Scroll reveal: section headings, cards and other section blocks rise in once as they enter the
// viewport (or once scrolled past, so a fast fling never leaves anything hidden), with cards in a
// row staggered. Skipped when motion is reduced.
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var pending = Array.prototype.filter.call(
    document.querySelectorAll('main section:not(.page-hero) > *, .card'),
    function (el) {
      return !el.closest('.hero-copy, .hero-visual') && !el.classList.contains('visually-hidden') &&
        (el.classList.contains('card') || !el.querySelector('.card'));
    });
  if (!pending.length) return;
  document.documentElement.classList.add('js-motion');
  pending.forEach(function (el) {
    if (el.classList.contains('card')) {
      var index = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--reveal-delay', Math.min(index, 4) * 90 + 'ms');
    }
    el.classList.add('reveal');
  });
  var queued = false;
  function check() {
    queued = false;
    var limit = window.innerHeight * 0.92;
    pending = pending.filter(function (el) {
      if (el.getBoundingClientRect().top > limit) return true;
      el.classList.add('in');
      return false;
    });
    if (!pending.length) window.removeEventListener('scroll', onScroll);
  }
  function onScroll() {
    if (!queued) { queued = true; window.requestAnimationFrame(check); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
