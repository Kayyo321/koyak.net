// The email card copies the address instead of opening a mail client, then shows a check for a moment.
(() => {
  const btn = document.getElementById("copy-email");
  if (!btn) return;
  const status = document.getElementById("copy-status");
  let timer = 0;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // no async clipboard (http, old browsers, blocked): fall back to a throwaway selection
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      btn.focus({ preventScroll: true });
      return ok;
    }
  }

  btn.addEventListener("click", async () => {
    const ok = await copy(btn.dataset.email);
    clearTimeout(timer);
    // if the browser refuses the clipboard, show the address so it can be copied by hand (no false checkmark)
    btn.classList.toggle("is-copied", ok);
    btn.classList.toggle("is-shown", !ok);
    status.textContent = ok ? "Email address copied to clipboard" : "Email address: " + btn.dataset.email;
    timer = setTimeout(() => {
      btn.classList.remove("is-copied", "is-shown");
      status.textContent = "";
    }, ok ? 1800 : 4000);
  });
})();
