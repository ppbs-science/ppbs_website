// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.topbar nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  var groups = Array.from(document.querySelectorAll('.nav-group'));
  function closeGroups(except) {
    groups.forEach(function (group) {
      if (group === except) return;
      group.classList.remove('open');
      var button = group.querySelector('.nav-group__trigger');
      if (button) button.setAttribute('aria-expanded', 'false');
    });
  }
  groups.forEach(function (group) {
    var button = group.querySelector('.nav-group__trigger');
    if (!button) return;
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var isOpen = !group.classList.contains('open');
      closeGroups(group);
      group.classList.toggle('open', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
    });
    group.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        group.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      }
    });
  });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('.nav-group')) closeGroups();
  });

  // Active page highlight
  var page = document.body.getAttribute('data-page');
  if (page) {
    var link = document.querySelector('.topbar nav a[data-page="' + page + '"]');
    if (link) {
      link.classList.add('active');
      var activeGroup = link.closest('.nav-group');
      if (activeGroup) activeGroup.classList.add('has-active');
    }
  }

  // Keep visitors on the PPBS site when they follow an external source.
  // Internal, same-origin, anchor, mailto, and telephone links are untouched.
  document.querySelectorAll('a[href]').forEach(function (anchor) {
    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:)/i.test(href)) return;

    try {
      var destination = new URL(href, window.location.href);
      if (!/^https?:$/.test(destination.protocol) || destination.origin === window.location.origin) return;

      anchor.setAttribute('target', '_blank');
      var rel = new Set((anchor.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      anchor.setAttribute('rel', Array.from(rel).join(' '));
    } catch (error) {
      // Leave malformed and non-URL href values unchanged; validation reports
      // broken local references separately during the build.
    }
  });
});
