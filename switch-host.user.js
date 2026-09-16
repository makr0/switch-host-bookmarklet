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

  const layoutHosts = (hosts, w, h) => {
    const adj = {};
    hosts.forEach(host => { adj[host] = new Set(); });
    hostPairs.forEach(pair => {
      if (pair.from !== pair.to) {
        adj[pair.from].add(pair.to);
        adj[pair.to].add(pair.from);
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
    const cw = Math.min(360, (w - 40) / cols);
    const ch = Math.min(260, (h - 40) / rows);
    components.forEach((comp, ci) => {
      const cx = w / 2 + (ci % cols - (cols - 1) / 2) * cw;
      const cy = h / 2 + (Math.floor(ci / cols) - (rows - 1) / 2) * ch;
      if (comp.length >= 2) {
        const order = [];
        const done = {};
        comp.forEach(h => { done[h] = false; });
        const dfs = h => {
          done[h] = true;
          order.push(h);
          adj[h].forEach(next => { if (!done[next]) dfs(next); });
        };
        dfs(comp[0]);
        const N = order.length;
        const R = Math.max(50, Math.min(cw, ch) / 2 - 35);
        order.forEach((host, i) => {
          const ang = N === 2 ? (i === 0 ? -Math.PI / 2 : Math.PI / 2) : (i / N) * 2 * Math.PI - Math.PI / 2;
          pos[host] = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
        });
      } else {
        pos[comp[0]] = { x: cx, y: cy };
      }
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

    const build = () => {
      const w = Math.max(100, container.clientWidth || 400);
      const h = Math.max(100, container.clientHeight || 300);
      const pos = layoutHosts(hosts, w, h);
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
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
        label.textContent = host;
        const title = document.createElementNS(NS, "title");
        title.textContent = host;
        g.appendChild(title);
        g.appendChild(label);
        svg.appendChild(g);
      });
      container.replaceChildren(svg);
    };

    build();
    new ResizeObserver(build).observe(container);
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
      top: "5vh",
      left: "5vw",
      width: "90vw",
      height: "90vh",
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
      Object.assign(overlay.style, { resize: "both", overflow: "hidden", minWidth: "320px", minHeight: "420px" });
    }

    if (shiftHeld) {
      const dataJson = JSON.stringify(hostPairs, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      overlay.innerHTML = `
        <div>Switchhost Tool</div>
        <input type="text" value="${target}" style="padding:8px;border-radius:5px;border:none;width:200px;"/>
        <div style="display:flex;gap:10px;flex:1;width:100%;align-items:stretch;">
          <div class="sh-graph" style="flex:3;min-height:250px;background:#fff;border-radius:5px;"></div>
          <pre style="flex:2;margin:0;padding:10px;background:#fff;color:#333;font-size:12px;overflow:auto;border-radius:5px;">${dataJson}</pre>
        </div>
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
