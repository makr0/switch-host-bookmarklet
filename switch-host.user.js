// ==UserScript==
// @name         Switch Host
// @namespace    switch-host
// @version      1.0.2
// @description  Switches between old and new host names on the current page. Hold Shift to edit the target.
// @match        *
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/makr0/switch-host-bookmarklet/main/switch-host.user.js
// @downloadURL    https://raw.githubusercontent.com/makr0/switch-host-bookmarklet/main/switch-host.user.js
// ==/UserScript==

(() => {
  const STORAGE_KEY = "hostPairs";
  let shiftHeld = false;

  const stripProtocol = host => {
    let h = host || "";
    if (h.startsWith("https://")) {
      h = h.slice(8);
    } else if (h.startsWith("http://")) {
      h = h.slice(7);
    }
    while (h.endsWith("/")) h = h.slice(0, -1);
    return h;
  };

  let hostPairs = [];
  try {
    const stored = JSON.parse(GM_getValue(STORAGE_KEY));
    if (Array.isArray(stored)) {
      hostPairs = stored
        .map(pair => ({ from: stripProtocol(pair.from), to: stripProtocol(pair.to) }))
        .filter(pair => pair.from && pair.to);
    }
  } catch (e) {}

  document.addEventListener("keydown", e => { if (e.key === "Shift") shiftHeld = true; });
  document.addEventListener("keyup", e => { if (e.key === "Shift") shiftHeld = false; });

  const switchHost = () => {
    const currentHost = window.location.host;
    const forward = hostPairs.find(pair => pair.from === currentHost);
    const reverse = forward || hostPairs.find(pair => pair.to === currentHost);

    let target;
    if (forward) {
      target = forward.to;
    } else if (reverse) {
      target = reverse.from;
    } else {
      const answer = prompt('Host "' + currentHost + '" ist unbekannt. Wohin soll umgeschaltet werden?');
      if (!answer) return;
      target = stripProtocol(answer.trim());
      target = target.split("/")[0].split("?")[0].split("#")[0];
      if (!target) return;
      if (!hostPairs.some(pair => pair.from === currentHost && pair.to === target)) {
        hostPairs.push({ from: currentHost, to: target });
      }
      GM_setValue(STORAGE_KEY, JSON.stringify(hostPairs));
    }

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#333",
      color: "white",
      padding: shiftHeld ? "20px" : "30px",
      borderRadius: "20px",
      zIndex: "5000",
      display: "flex",
      flexDirection: "column",
      gap: shiftHeld ? "15px" : "0",
      alignItems: "center"
    });

    if (shiftHeld) {
      overlay.innerHTML = `
        <div>Hold umzuschalten zu <b>${target}</b></div>
        <input type="text" value="${target}" style="padding:8px;border-radius:5px;border:none;width:200px;" onfocus="this.select()"/>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:5px;cursor:pointer;">Umstellen</button>
          <button style="padding:8px 16px;background:#f44336;color:white;border:none;border-radius:5px;cursor:pointer;">Abbrechen</button>
        </div>
      `;
      const input = overlay.querySelector("input");
      const confirmBtn = overlay.querySelectorAll("button")[0];
      const cancelBtn = overlay.querySelectorAll("button")[1];
      confirmBtn.addEventListener("click", () => {
        const newTarget = stripProtocol(input.value.trim().split("/")[0].split("?")[0].split("#")[0]);
        if (!newTarget) return;
        window.location.href =
          window.location.protocol + "//" + newTarget +
          window.location.pathname + window.location.search + window.location.hash;
      });
      cancelBtn.addEventListener("click", () => { document.body.removeChild(overlay); });
      overlay.querySelector("input").focus();
    } else {
      overlay.innerHTML = `Schalte um zu <b>${target}</b> ...`;
      setTimeout(() => {
        window.location.href =
          window.location.protocol + "//" + target +
          window.location.pathname + window.location.search + window.location.hash;
      }, 10);
    }

    document.body.appendChild(overlay);
  };

  unsafeWindow.switchHost = switchHost;
  GM_registerMenuCommand("Switch host", switchHost);
})();
