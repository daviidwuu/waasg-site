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
