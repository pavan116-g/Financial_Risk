// Purely cosmetic countdown readout — atmosphere only, does not gate or affect any app behavior.
(function () {
  let remaining = 5 * 60;

  function tick() {
    remaining = remaining <= 0 ? 5 * 60 : remaining - 1;
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    document.querySelectorAll('[data-ops-timer]').forEach(el => {
      el.textContent = `${m}:${s}`;
    });
  }

  tick();
  setInterval(tick, 1000);
})();
