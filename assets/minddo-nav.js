(function () {
  var HAMBURGER =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
  var CLOSE =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>';

  function wire(nav) {
    var menu = nav.querySelector(".nav-menu");
    if (!menu) return;
    if (nav.querySelector(":scope > .minddo-hamburger")) return;

    var btn = document.createElement("button");
    btn.className = "minddo-hamburger";
    btn.type = "button";
    btn.setAttribute("aria-label", "Menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = HAMBURGER;

    function close() {
      nav.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = HAMBURGER;
    }
    function open() {
      nav.classList.add("nav-open");
      btn.setAttribute("aria-expanded", "true");
      btn.innerHTML = CLOSE;
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (nav.classList.contains("nav-open")) close();
      else open();
    });

    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && nav.classList.contains("nav-open")) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });

    nav.insertBefore(btn, menu);
  }

  function init() {
    document.querySelectorAll("nav.navbar").forEach(wire);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
