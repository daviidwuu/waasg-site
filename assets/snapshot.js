// Free site snapshot form. There is no server: the form composes an email to david@waasg.com
// and opens the visitor's email app. Fallbacks (Gmail, copy) cover people without an email app.
// Without JavaScript the form still works as a plain mailto: form.
(function () {
  'use strict';
  var TO = 'david@waasg.com';
  var SUBJECT = 'Free site snapshot request';
  var form = document.getElementById('snapshot-form');
  if (!form) return;
  var status = document.getElementById('snapshot-status');
  var fields = form.elements;
  form.noValidate = true;

  // Pre-select a plan when arriving from the pricing page (/snapshot?plan=growth).
  try {
    var plan = new URLSearchParams(window.location.search).get('plan');
    if (plan) {
      for (var i = 0; i < fields.plan.options.length; i++) {
        if (fields.plan.options[i].value === plan) fields.plan.value = plan;
      }
    }
  } catch (e) { /* old browser: ignore */ }

  // Notes: once something is typed, the hint under the box counts the characters left. The textarea's
  // maxlength keeps the email link short enough for desktop email apps. While the box is empty (and
  // without JavaScript) the hint just states the limit.
  var notesHint = document.getElementById('notes-hint');
  if (notesHint && fields.notes.maxLength > 0) {
    var limitText = notesHint.textContent;
    var showCharactersLeft = function () {
      var left = Math.max(0, fields.notes.maxLength - fields.notes.value.length);
      notesHint.textContent = fields.notes.value ? left.toLocaleString('en-US') + (left === 1 ? ' character' : ' characters') + ' left' : limitText;
    };
    fields.notes.addEventListener('input', showCharactersLeft);
    window.addEventListener('pageshow', showCharactersLeft);
    showCharactersLeft();
  }

  function setError(input, message) {
    var el = document.getElementById(input.id + '-error');
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (el) el.textContent = message || '';
    return !message;
  }

  function validate() {
    var website = fields.website.value.trim();
    var ok = [
      setError(fields.website, /^(https?:\/\/)?[^\s.\/]+\.[^\s]{2,}$/i.test(website) ? '' : 'Enter your website address, for example yourbusiness.com'),
      setError(fields.name, fields.name.value.trim() ? '' : 'Enter your name'),
      setError(fields.business, fields.business.value.trim() ? '' : 'Enter your business name'),
    ];
    var firstBad = [fields.website, fields.name, fields.business][ok.indexOf(false)];
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function message() {
    var website = fields.website.value.trim();
    if (!/^https?:\/\//i.test(website)) website = 'https://' + website;
    var lines = [
      'Hi David,',
      '',
      'Please send me a free site snapshot.',
      '',
      'Website: ' + website,
      'Name: ' + fields.name.value.trim(),
      'Business: ' + fields.business.value.trim(),
    ];
    if (fields.goal.value) lines.push('What matters most: ' + fields.goal.value);
    if (fields.plan.value) lines.push('Plan I\'m curious about: ' + fields.plan.options[fields.plan.selectedIndex].text);
    var notes = fields.notes.value.trim();
    // One entry per line, so every line break in the mailto body becomes %0D%0A (RFC 6068), notes included.
    if (notes) lines.push.apply(lines, ['', 'Notes:'].concat(notes.split(/\r\n|\r|\n/)));
    lines.push('', 'Thanks!');
    return lines;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!validate()) return;
    var lines = message();
    var enc = encodeURIComponent;
    var mailto = 'mailto:' + TO + '?subject=' + enc(SUBJECT) + '&body=' + enc(lines.join('\r\n'));
    var gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + enc(TO) + '&su=' + enc(SUBJECT) + '&body=' + enc(lines.join('\n'));

    document.getElementById('status-mailto').href = mailto;
    document.getElementById('status-gmail').href = gmail;
    document.getElementById('status-text').value = 'To: ' + TO + '\nSubject: ' + SUBJECT + '\n\n' + lines.join('\n');
    status.hidden = false;
    status.focus({ preventScroll: true });
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    status.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    window.location.href = mailto;
  });

  document.getElementById('status-copy').addEventListener('click', function () {
    var box = document.getElementById('status-text');
    var button = this;
    function done(ok) {
      button.textContent = ok ? 'Copied' : 'Select the text below and copy it';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(box.value).then(function () { done(true); }, function () { box.select(); done(false); });
    } else {
      box.select();
      done(false);
    }
  });
})();
