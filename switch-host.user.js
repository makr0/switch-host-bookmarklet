// ==UserScript==
// @name         Switch Host
// @namespace    switch-host
// @version      1.1.3
// @description  Switches between old and new host names on the current page. Hold Shift to edit the target.
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js
// @updateURL    https://github.com/makr0/switch-host-bookmarklet/raw/refs/heads/main/switch-host.user.js
// @downloadURL    https://github.com/makr0/switch-host-bookmarklet/raw/refs/heads/main/switch-host.user.js
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

  const buildAdjacency = hosts => {
    const adj = {};
    hosts.forEach(host => { adj[host] = new Set(); });
    hostPairs.forEach(pair => {
      if (pair.from !== pair.to) {
        adj[pair.from].add(pair.to);
        adj[pair.to].add(pair.from);
      }
    });
    return adj;
  };

  const computeComponents = hosts => {
    const adj = buildAdjacency(hosts);
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
    return components;
  };

  const layoutHosts = (hosts, w, h) => {
    const adj = buildAdjacency(hosts);
    const components = computeComponents(hosts);
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
          const ang = N === 2 ? (i === 0 ? -Math.PI / 2 : Math.PI / 2) : (i / N) * 2 * Math.PI - Math.PI / 2 + Math.PI / 12;
          const c = Math.cos(ang), s = Math.sin(ang);
          pos[host] = { x: cx + R * c, y: cy + R * s, lx: cx + (R + 20) * c, ly: cy + (R + 20) * s + (s > 0.25 ? 6 : 0), anchor: c > 0.25 ? "start" : c < -0.25 ? "end" : "middle" };
        });
      } else {
        pos[comp[0]] = { x: cx, y: cy, lx: cx, ly: cy + 24, anchor: "middle" };
      }
    });
    return pos;
  };

  // Persistent per-host positions so re-renders (e.g. editing pairs) don't reset the layout;
  // brand-new hosts start clustered at the center and flow in.
  const nodePositions = {};
  let activeSim = null;

  // Node colouring: the current host is green, a click marks a node yellow as the anchor for a
  // Shift+click connection. The yellow mark lives outside the DOM so re-renders keep it.
  let markedHost = null;
  let activeNodeRefs = null;
  let activeCurrentHost = null;

  const paintNode = (ref, host) => {
    const isMarked = host === markedHost;
    const isCurrent = host === activeCurrentHost;
    ref.circle.setAttribute("r", isCurrent ? 12 : 8);
    ref.circle.setAttribute("fill", isMarked ? "#FFC107" : isCurrent ? "#4CAF50" : "#B0BEC5");
    ref.circle.setAttribute("stroke", isMarked ? "#F57F17" : isCurrent ? "#388E3C" : "#78909C");
  };

  const repaintNodes = () => {
    if (!activeNodeRefs) return;
    Object.keys(activeNodeRefs).forEach(host => paintNode(activeNodeRefs[host], host));
  };

  const stopActiveSim = () => {
    if (activeSim) { activeSim.stop(); activeSim = null; }
  };

  // Deduped directed pairs as host-name strings, shared by DOM building and the simulation.
  const graphPairs = () => {
    const seen = new Set();
    const out = [];
    for (const pair of hostPairs) {
      if (pair.from === pair.to) continue;
      const key = pair.from + "\u2192" + pair.to;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: pair.from, to: pair.to });
    }
    return out;
  };

  // Serialized pair list for the editor textarea, ordered by component then host names.
  const formatPairsJson = currentHost => {
    const hosts = [...new Set([currentHost, ...hostPairs.flatMap(pair => [pair.from, pair.to])])];
    const comps = computeComponents(hosts).map(comp => comp.slice().sort()).sort((a, b) => a[0].localeCompare(b[0]));
    const compIndex = {};
    comps.forEach((comp, i) => comp.forEach(host => { compIndex[host] = i; }));
    return ("[" + hostPairs
      .slice()
      .sort((a, b) => compIndex[a.from] - compIndex[b.from] || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
      .map(pair => `  { "from": ${JSON.stringify(pair.from)}, "to": ${JSON.stringify(pair.to)} }`)
      .join(",\n") + "]").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  };

  // Create the SVG for a host graph and position elements from `pos` ({host:{x,y,lx?,ly?,anchor?}}).
  // Returns element references so callers can update positions (one-shot or live per tick).
  const buildGraphDom = (container, hosts, currentHost, onSelect, onHover, w, h, pairs, pos) => {
    const NS = "http://www.w3.org/2000/svg";
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
    arrow.setAttribute("fill", "#000000");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const linkRefs = pairs.map(pair => {
      const line = document.createElementNS(NS, "line");
      line.setAttribute("stroke", "#000000");
      line.setAttribute("marker-end", "url(#sh-arrow)");
      svg.appendChild(line);
      return { el: line, from: pair.from, to: pair.to };
    });

    const nodeRefs = {};
    hosts.forEach(host => {
      const g = document.createElementNS(NS, "g");
      g.style.cursor = "grab";
      g.addEventListener("click", event => onSelect(host, event));
      g.addEventListener("mouseenter", () => onHover(host));
      g.addEventListener("mouseleave", () => onHover(null));
      const circle = document.createElementNS(NS, "circle");
      const label = document.createElementNS(NS, "text");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#37474F");
      label.textContent = host;
      const title = document.createElementNS(NS, "title");
      title.textContent = host;
      g.appendChild(circle);
      g.appendChild(title);
      g.appendChild(label);
      svg.appendChild(g);
      nodeRefs[host] = { g, circle, label };
    });

    activeNodeRefs = nodeRefs;
    activeCurrentHost = currentHost;
    hosts.forEach(host => paintNode(nodeRefs[host], host));
    positionGraphDom(linkRefs, nodeRefs, hosts, pos);
    container.replaceChildren(svg);
    return { linkRefs, nodeRefs };
  };

  // Write a `pos` map onto the graph elements (link endpoints + node/label positions).
  const positionGraphDom = (linkRefs, nodeRefs, hosts, pos) => {
    for (const l of linkRefs) {
      const a = pos[l.from], b = pos[l.to];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) { l.el.setAttribute("x1", a.x); l.el.setAttribute("y1", a.y); l.el.setAttribute("x2", b.x); l.el.setAttribute("y2", b.y); continue; }
      const ux = dx / len, uy = dy / len;
      l.el.setAttribute("x1", a.x + 12 * ux);
      l.el.setAttribute("y1", a.y + 12 * uy);
      l.el.setAttribute("x2", b.x - 16 * ux);
      l.el.setAttribute("y2", b.y - 16 * uy);
    }
    hosts.forEach(host => {
      const p = pos[host];
      if (!p) return;
      const ref = nodeRefs[host];
      ref.circle.setAttribute("cx", p.x);
      ref.circle.setAttribute("cy", p.y);
      ref.label.setAttribute("x", p.lx != null ? p.lx : p.x);
      ref.label.setAttribute("y", p.ly != null ? p.ly : p.y + 18);
      ref.label.setAttribute("text-anchor", p.anchor || "middle");
    });
  };

  // Deterministically clear label collisions on a settled layout: keep labels in priority order
  // (current host first) and hide any that overlap an already-kept one. Hidden hosts stay
  // identifiable via their node tooltip; the pass re-runs each settle so labels can reappear.
  const resolveLabelOverlaps = (nodeRefs, hosts, currentHost) => {
    if (!hosts.length || typeof nodeRefs[hosts[0]].label.getBBox !== "function") return;
    const overlaps = (a, b) => !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
    const kept = [];
    for (const host of [currentHost, ...hosts.filter(h => h !== currentHost)]) {
      const label = nodeRefs[host].label;
      label.style.display = ""; // un-hide before measuring so getBBox is valid
      const box = label.getBBox();
      if (kept.some(k => overlaps(box, k))) { label.style.display = "none"; } else { kept.push(box); }
    }
  };

  // Live, draggable force layout: seeds new hosts at the center and animates until settled.
  const renderInteractiveGraph = (container, hosts, currentHost, onSelect, onHover, w, h, d3) => {
    const pairs = graphPairs();
    const cx = w / 2, cy = h / 2;

    // Seed: reuse persisted positions for known hosts, else cluster at the center.
    const nodes = hosts.map((host, i) => {
      const prev = nodePositions[host];
      if (prev) return { id: host, x: prev.x, y: prev.y };
      const ang = i * 2.399; // golden angle → tight center cluster without exact overlap
      return { id: host, x: cx + 4 * Math.cos(ang), y: cy + 4 * Math.sin(ang) };
    });

    const components = computeComponents(hosts);
    const compOf = {};
    const cols = Math.max(1, Math.ceil(Math.sqrt(components.length)));
    const rows = Math.max(1, Math.ceil(components.length / cols));
    const cw = (w - 40) / cols;
    const ch = (h - 40) / rows;
    components.forEach((comp, ci) => comp.forEach(host => { compOf[host] = ci; }));
    const centerFor = host => ({ x: w / 2 + ((compOf[host] % cols) - (cols - 1) / 2) * cw, y: h / 2 + (Math.floor(compOf[host] / cols) - (rows - 1) / 2) * ch });

    const links = pairs.map(p => ({ source: p.from, target: p.to }));
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(n => n.id).distance(48))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("collide", d3.forceCollide(20))
      .force("x", d3.forceX(n => centerFor(n.id).x).strength(0.6))
      .force("y", d3.forceY(n => centerFor(n.id).y).strength(0.6));

    const seedPos = {};
    nodes.forEach(n => { seedPos[n.id] = { x: n.x, y: n.y }; });
    const { linkRefs, nodeRefs } = buildGraphDom(container, hosts, currentHost, onSelect, onHover, w, h, pairs, seedPos);

    let labelsResolved = false;
    const resolveLabelsOnce = () => {
      if (labelsResolved) return;
      labelsResolved = true;
      resolveLabelOverlaps(nodeRefs, hosts, currentHost);
    };

    sim.on("tick", () => {
      nodes.forEach(n => { nodePositions[n.id] = { x: n.x, y: n.y }; });
      for (let i = 0; i < links.length; i++) {
        const l = links[i], el = linkRefs[i].el;
        const sx = l.source.x, sy = l.source.y, tx = l.target.x, ty = l.target.y;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) { el.setAttribute("x1", sx); el.setAttribute("y1", sy); el.setAttribute("x2", tx); el.setAttribute("y2", ty); continue; }
        const ux = dx / len, uy = dy / len;
        el.setAttribute("x1", sx + 12 * ux);
        el.setAttribute("y1", sy + 12 * uy);
        el.setAttribute("x2", tx - 16 * ux);
        el.setAttribute("y2", ty - 16 * uy);
      }
      nodes.forEach(n => {
        const ref = nodeRefs[n.id];
        ref.circle.setAttribute("cx", n.x);
        ref.circle.setAttribute("cy", n.y);
        ref.label.setAttribute("x", n.x);
        ref.label.setAttribute("y", n.y + 18);
        ref.label.setAttribute("text-anchor", "middle");
      });
      if (sim.alpha() < 0.02) resolveLabelsOnce(); // settled: clear label collisions
    });

    sim.on("end", resolveLabelsOnce); // backstop if the alpha gate missed a settle

    // Drag: pin the grabbed node to the pointer and keep the simulation hot so neighbours flow
    // around it. Reheat + restart explicitly: d3 stops its timer once the layout settles, so
    // alphaTarget() alone would leave a settled graph frozen (i.e. impossible to drag).
    const reheat = () => {
      sim.alphaTarget(0.3);
      if (sim.alpha() < 0.3) sim.alpha(0.3);
      sim.restart();
    };

    // Keep dragged nodes inside the visible area (node radius + a little label room).
    const clamp = (v, max) => Math.max(14, Math.min(max - 14, v));

    hosts.forEach(host => {
      const n = nodes.find(nn => nn.id === host);
      const ref = nodeRefs[host];
      d3.select(ref.g).call(
        d3.drag()
          .on("start", event => {
            if (!event.active) { reheat(); labelsResolved = false; }
            n.fx = n.x;
            n.fy = n.y;
            ref.g.style.cursor = "grabbing";
          })
          .on("drag", event => {
            n.fx = clamp(event.x, w);
            n.fy = clamp(event.y, h);
          })
          .on("end", event => {
            if (!event.active) sim.alphaTarget(0);
            // Stay where the node was dropped instead of springing back into the force layout.
            n.fx = clamp(n.x, w);
            n.fy = clamp(n.y, h);
            ref.g.style.cursor = "grab";
          })
      );
    });

    activeSim = sim;
  };

  const renderHostGraph = (container, currentHost, onSelect, onHover) => {
    stopActiveSim(); // always release any previous live simulation before rebuilding
    activeNodeRefs = null; // buildGraphDom re-registers the nodes it paints
    if (!hostPairs.length) {
      container.textContent = "no hosts known yet";
      Object.assign(container.style, { display: "flex", alignItems: "center", justifyContent: "center", color: "#888" });
      return;
    }
    const hosts = [...new Set([currentHost, ...hostPairs.flatMap(pair => [pair.from, pair.to])])];

    const w = Math.max(100, container.clientWidth || 400);
    const h = Math.max(100, container.clientHeight || 300);
    const d3 = window.d3;
    if (d3 && typeof d3.forceSimulation === "function") {
      renderInteractiveGraph(container, hosts, currentHost, onSelect, onHover, w, h, d3);
    } else {
      // No d3 available: fall back to a static deterministic layout.
      const pos = layoutHosts(hosts, w, h);
      buildGraphDom(container, hosts, currentHost, onSelect, onHover, w, h, graphPairs(), pos);
    }
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
    markedHost = null; // the yellow connect anchor is scoped to one overlay session
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

    let highlightPairs;
    let renderGraph;

    if (shiftHeld) {
      const dataJson = formatPairsJson(currentHost);
      overlay.innerHTML = `
        <div>Switchhost Tool</div>
        <input type="text" value="${target}" style="padding:8px;border-radius:5px;border:none;width:200px;"/>
        <div style="display:flex;gap:10px;flex:1;width:100%;align-items:stretch;">
          <div class="sh-graph" style="flex:3;min-height:250px;background:#fff;border-radius:5px;"></div>
          <textarea spellcheck="false" wrap="off" style="flex:2;margin:0;padding:10px;background:#fff;color:#333;font-size:12px;font-family:monospace;overflow:auto;border-radius:5px;">${dataJson}</textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:5px;cursor:pointer;">Umstellen</button>
          <button style="padding:8px 16px;background:#f44336;color:white;border:none;border-radius:5px;cursor:pointer;">Abbrechen</button>
          <button style="padding:8px 16px;background:#78909C;color:white;border:none;border-radius:5px;cursor:pointer;display:none;">Rückgängig</button>
        </div>
      `;
      const input = overlay.querySelector("input");
      input.addEventListener("focus", () => input.select());
      const dataEl = overlay.querySelector("textarea");
      const undoBtn = overlay.querySelectorAll("button")[2];
      const undoStack = [];
      let renderTimer = 0;

      const refreshUndo = () => { undoBtn.style.display = undoStack.length ? "" : "none"; };

      // Snapshot the pair list before an edit so the Undo button can restore it.
      const snapshot = () => {
        undoStack.push(hostPairs.map(pair => ({ from: pair.from, to: pair.to })));
        if (undoStack.length > 20) undoStack.shift();
        refreshUndo();
      };

      const persistPairs = () => { GM_setValue(STORAGE_KEY, JSON.stringify(hostPairs)); };

      renderGraph = () => {
        renderHostGraph(overlay.querySelector(".sh-graph"), currentHost, onNodeClick, highlightPairs);
      };

      // Shift+click while a node is yellow: connect the two hosts and drop the yellow mark.
      // Without an anchor (or on the anchor itself) Shift behaves like a normal click.
      const connectHosts = (anchor, other) => {
        const exists = hostPairs.some(pair =>
          (pair.from === anchor && pair.to === other) || (pair.from === other && pair.to === anchor));
        if (!exists) {
          snapshot();
          hostPairs.push({ from: anchor, to: other });
          persistPairs();
        }
        markedHost = null;
        dataEl.value = formatPairsJson(currentHost);
        renderGraph();
      };

      const onNodeClick = (host, event) => {
        if (event && event.shiftKey && markedHost && markedHost !== host) {
          connectHosts(markedHost, host);
          return;
        }
        markedHost = markedHost === host ? null : host; // clicking the yellow node again unmarks it
        repaintNodes();
        input.value = host;
        input.focus();
      };

      const undo = () => {
        const previous = undoStack.pop();
        if (!previous) return;
        hostPairs = previous;
        markedHost = null;
        persistPairs();
        dataEl.value = formatPairsJson(currentHost);
        refreshUndo();
        renderGraph();
      };

      undoBtn.addEventListener("click", undo);

      dataEl.addEventListener("input", () => {
        try {
          const parsed = JSON.parse(dataEl.value.trim());
          if (!Array.isArray(parsed)) return;
          hostPairs = parsed
            .filter(pair => pair && typeof pair === "object")
            .map(pair => ({ from: stripProtocol(String(pair.from || "")), to: stripProtocol(String(pair.to || "")) }))
            .filter(pair => pair.from && pair.to);
        } catch (e) { return; }
        undoStack.length = 0; // manual edits make the connection history meaningless
        refreshUndo();
        persistPairs();
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderGraph, 150);
      });
      highlightPairs = host => {
        if (!host) { dataEl.setSelectionRange(0, 0); return; }
        const needle = '"' + host + '"';
        let start = -1, end = -1, offset = 0;
        for (const line of dataEl.value.split("\n")) {
          if (line.includes(needle)) {
            if (start < 0) start = offset;
            end = offset + line.length;
          }
          offset += line.length + 1;
        }
        if (start >= 0) dataEl.setSelectionRange(start, end);
      };
      const confirmBtn = overlay.querySelectorAll("button")[0];
      const cancelBtn = overlay.querySelectorAll("button")[1];
      confirmBtn.addEventListener("click", () => {
        const newTarget = stripProtocol(input.value.trim()).split("/")[0].split("?")[0].split("#")[0];
        if (!newTarget) return;
        if (!hostPairs.some(pair => pair.from === currentHost && pair.to === newTarget)) {
          hostPairs.push({ from: currentHost, to: newTarget });
        }
        persistPairs();
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
      markedHost = null;
      renderGraph();
    }
  };

  unsafeWindow.switchHost = switchHost;
  GM_registerMenuCommand("Switch host", switchHost);
})();
