(function () {
  const cards = [...document.querySelectorAll('.contribution-card')];
  const area = document.getElementById('contribution-area-filter');
  const country = document.getElementById('contribution-country-filter');
  const language = document.getElementById('contribution-language-filter');
  const role = document.getElementById('contribution-role-filter');
  const count = document.getElementById('contribution-count');
  const reset = document.getElementById('contribution-filter-reset');

  if (!area || !country || !language || !role || !count) return;

  function hasToken(card, key, value) {
    if (!value) return true;
    return (card.dataset[key] || '').split('|').includes(value);
  }

  function update() {
    let visible = 0;
    for (const card of cards) {
      const show = hasToken(card, 'areas', area.value)
        && hasToken(card, 'countries', country.value)
        && hasToken(card, 'languages', language.value)
        && hasToken(card, 'roles', role.value);
      card.hidden = !show;
      if (show) visible += 1;
    }
    count.textContent = cards.length
      ? `${visible} of ${cards.length} projects shown`
      : 'No verified public contribution records have been added yet.';
  }

  for (const control of [area, country, language, role]) control.addEventListener('change', update);
  reset.addEventListener('click', function () {
    area.value = '';
    country.value = '';
    language.value = '';
    role.value = '';
    update();
  });
  update();
})();
