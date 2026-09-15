// ==UserScript==
// @name         Switch Host
// @namespace    switch-host
// @version      1.0.9
// @description  Switches between old and new host names on the current page. Hold Shift to edit the target.
// @match        *://*/*
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

  const layoutHosts = hosts => {
    const adj = {};
    hosts.forEach(host => { adj[host] = []; });
    hostPairs.forEach(pair => {
      if (pair.from !== pair.to) {
        adj[pair.from].push(pair.to);
        adj[pair.to].push(pair.from);
      }
    });
    const seen = {};
    const components = [];
    hosts.forEach(host => {
      if (seen[host]) return;
      const comp = [host];
      seen[host] = true;
      const queue = [host];
      while (queue.length) {
        adj[queue.shift()].forEach(next => {
          if (!seen[next]) {
            seen[next] = true;
            comp.push(next);
            queue.push(next);
          }
        });
      }
      components.push(comp);
    });
    const pos = {};
    const cols = Math.ceil(Math.sqrt(components.length));
    const rows = Math.ceil(components.length / cols);
    const cw = Math.min(190, 380 / cols);
    const ch = Math.min(140, 280 / rows);
    components.forEach((comp, ci) => {
      const cx = 200 + (ci % cols - (cols - 1) / 2) * cw;
      const cy = 150 + (Math.floor(ci / cols) - (rows - 1) / 2) * ch;
      const nCols = comp.length <= 4 ? 1 : Math.min(3, Math.ceil(Math.sqrt(comp.length)));
      const nRows = Math.ceil(comp.length / nCols);
      const dx = Math.min(95, (cw - 20) / Math.max(nCols - 1, 1));
      const dy = Math.min(50, (ch - 20) / Math.max(nRows - 1, 1));
      comp.forEach((host, i) => {
        pos[host] = {
          x: cx + (i % nCols - (nCols - 1) / 2) * dx,
          y: cy + (Math.floor(i / nCols) - (nRows - 1) / 2) * dy
        };
      });
    });
    return pos;
  };

  const renderHostGraph = (container, currentHost, onSelect) => {
    if (!hostPairs.length) {
      container.textContent = "no hosts known yet";
      Object.assign(container.style, { display: "flex", alignItems: "center", justifyContent: "center", color: "#888" });
      return;
    }
    const NS = "http://www.w3.org/2000/svg";
    const hosts = [...new Set([currentHost, ...hostPairs.flatMap(pair => [pair.from, pair.to])])];
    const pos = layoutHosts(hosts);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", "0 0 400 300");
    const defs = document.createElementNS(NS, "defs");
    const marker = document.createElementNS(NS, "marker");
    marker.setAttribute("id", "sh-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto");
    const arrow = document.createElementNS(NS, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "#90A4AE");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
    const seen = new Set();
    for (const pair of hostPairs) {
      if (pair.from === pair.to) continue;
      const key = pair.from + "\u2192" + pair.to;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = pos[pair.from];
      const b = pos[pair.to];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const ux = dx / len, uy = dy / len;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.x + 12 * ux);
      line.setAttribute("y1", a.y + 12 * uy);
      line.setAttribute("x2", b.x - 16 * ux);
      line.setAttribute("y2", b.y - 16 * uy);
      line.setAttribute("stroke", "#90A4AE");
      line.setAttribute("marker-end", "url(#sh-arrow)");
      svg.appendChild(line);
    }
    hosts.forEach(host => {
      const p = pos[host];
      const isCurrent = host === currentHost;
      const r = isCurrent ? 12 : 8;
      const g = document.createElementNS(NS, "g");
      g.style.cursor = "pointer";
      g.addEventListener("click", () => onSelect(host));
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", r);
      circle.setAttribute("fill", isCurrent ? "#4CAF50" : "#B0BEC5");
      circle.setAttribute("stroke", isCurrent ? "#388E3C" : "#78909C");
      g.appendChild(circle);
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", p.x);
      label.setAttribute("y", p.y + r + 12);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#37474F");
      label.textContent = host.length > 14 ? host.slice(0, 13) + "\u2026" : host;
      const title = document.createElementNS(NS, "title");
      title.textContent = host;
      g.appendChild(title);
      g.appendChild(label);
      svg.appendChild(g);
    });
    container.replaceChildren(svg);
  };

  const switchHost = () => {
    let shiftHeld = window.event && window.event.shiftKey;

    if (shiftHeld) {
      doSwitch(true);
      return;
    }

    let finished = false;
    let waiting = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (waiting) waiting.remove();
      doSwitch(shiftHeld);
    };

    const onKeyDown = e => {
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeld = true;
        finish();
      }
    };

    const onKeyUp = e => {
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeld = false;
      }
    };

    waiting = document.createElement("div");
    Object.assign(waiting.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#333",
      color: "white",
      padding: "20px 30px",
      borderRadius: "20px",
      zIndex: "5000"
    });
    waiting.textContent = "waiting for you to press shift";
    document.body.appendChild(waiting);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    setTimeout(finish, 500);
  };

  const doSwitch = (shiftHeld) => {
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
      Object.assign(overlay.style, { resize: "both", overflow: "hidden", width: "440px", height: "500px", minWidth: "320px", minHeight: "420px" });
    }

    if (shiftHeld) {
      overlay.innerHTML = `
        <div>Hold umzuschalten zu <b>${target}</b></div>
        <input type="text" value="${target}" style="padding:8px;border-radius:5px;border:none;width:200px;"/>
        <div class="sh-graph" style="flex:1;width:100%;min-height:250px;background:#fff;border-radius:5px;"></div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:5px;cursor:pointer;">Umstellen</button>
          <button style="padding:8px 16px;background:#f44336;color:white;border:none;border-radius:5px;cursor:pointer;">Abbrechen</button>
        </div>
      `;
      const input = overlay.querySelector("input");
      input.addEventListener("focus", () => input.select());
      const confirmBtn = overlay.querySelectorAll("button")[0];
      const cancelBtn = overlay.querySelectorAll("button")[1];
      confirmBtn.addEventListener("click", () => {
        const newTarget = stripProtocol(input.value.trim()).split("/")[0].split("?")[0].split("#")[0];
        if (!newTarget) return;
        if (!hostPairs.some(pair => pair.from === currentHost && pair.to === newTarget)) {
          hostPairs.push({ from: currentHost, to: newTarget });
        }
        GM_setValue(STORAGE_KEY, JSON.stringify(hostPairs));
        window.location.href =
          window.location.protocol + "//" + newTarget +
          window.location.pathname + window.location.search + window.location.hash;
      });
      cancelBtn.addEventListener("click", () => { document.body.removeChild(overlay); });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") confirmBtn.click();
      });
    } else {
      overlay.innerHTML = `Schalte um zu <b>${target}</b> ...`;
      setTimeout(() => {
        window.location.href =
          window.location.protocol + "//" + target +
          window.location.pathname + window.location.search + window.location.hash;
      }, 10);
    }

    document.body.appendChild(overlay);
    if (shiftHeld) {
      const input = overlay.querySelector("input");
      input.focus();
      renderHostGraph(overlay.querySelector(".sh-graph"), currentHost, host => {
        input.value = host;
        input.focus();
      });
    }
  };

  unsafeWindow.switchHost = switchHost;
  GM_registerMenuCommand("Switch host", switchHost);
})();
