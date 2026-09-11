(function () {
  if (window.__AGENTATION_INITIALIZED__) return;
  window.__AGENTATION_INITIALIZED__ = true;

  // ── Inject CSS ──
  const style = document.createElement('style');
  style.id = 'agentation-styles';
  style.textContent = `
    /* ── AGENTATION OVERLAY & TOOLBAR ── */
    #ag-toolbar-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 30px;
      padding: 10px 18px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45), 0 0 15px rgba(56, 189, 248, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
      user-select: none;
    }
    #ag-toolbar-btn:hover {
      transform: translateY(-2px);
      background: #1e293b;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.55), 0 0 22px rgba(56, 189, 248, 0.35);
    }
    #ag-toolbar-btn.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
      box-shadow: 0 0 25px rgba(14, 165, 233, 0.6);
    }
    #ag-toolbar-btn .ag-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38bdf8;
      animation: agPulse 1.8s infinite;
    }
    #ag-toolbar-btn.active .ag-dot {
      background: #ffffff;
      animation: none;
    }
    @keyframes agPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.7); }
    }

    /* ── CONTROLS BAR (WHEN ACTIVE) ── */
    #ag-controls {
      position: fixed;
      bottom: 76px;
      right: 24px;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 16px;
      padding: 10px 14px;
      display: none;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(16px);
      min-width: 240px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: agFadeIn 0.2s ease-out;
    }
    @keyframes agFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ag-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 6px;
    }
    .ag-count-badge {
      background: rgba(14, 165, 233, 0.2);
      color: #38bdf8;
      border-radius: 12px;
      padding: 1px 7px;
      font-size: 11px;
    }
    .ag-btn-row {
      display: flex;
      gap: 8px;
    }
    .ag-action-btn {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .ag-action-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .ag-action-btn.primary {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
      font-weight: 600;
    }
    .ag-action-btn.primary:hover {
      background: #0369a1;
    }
    .ag-help-text {
      font-size: 11px;
      color: #64748b;
      line-height: 1.4;
      text-align: center;
    }

    /* ── HOVER HIGHLIGHT BOX ── */
    #ag-highlighter {
      position: fixed;
      pointer-events: none;
      z-index: 999990;
      border: 2px solid #0ea5e9;
      background: rgba(14, 165, 233, 0.12);
      border-radius: 4px;
      display: none;
      transition: all 0.08s ease-out;
    }
    #ag-highlighter-tag {
      position: absolute;
      top: -24px;
      left: -2px;
      background: #0ea5e9;
      color: #ffffff;
      font-family: 'DM Mono', monospace, sans-serif;
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px 4px 0 0;
      white-space: nowrap;
      pointer-events: none;
    }

    /* ── ANNOTATION PIN ── */
    .ag-pin {
      position: absolute;
      z-index: 999995;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #e11d48;
      color: #ffffff;
      font-family: -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(225, 29, 72, 0.5), 0 0 0 2px #ffffff;
      cursor: pointer;
      transform: translate(-50%, -50%);
      transition: transform 0.15s;
    }
    .ag-pin:hover {
      transform: translate(-50%, -50%) scale(1.2);
    }

    /* ── ANNOTATION POPUP / MODAL ── */
    #ag-modal {
      position: fixed;
      z-index: 999998;
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
      width: 300px;
      display: none;
      flex-direction: column;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #ag-modal-target {
      font-family: 'DM Mono', monospace, monospace;
      font-size: 11px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #ag-modal-input {
      width: 100%;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #f1f5f9;
      font-size: 13px;
      padding: 10px;
      resize: vertical;
      min-height: 70px;
      outline: none;
      font-family: inherit;
    }
    #ag-modal-input:focus {
      border-color: #0ea5e9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.25);
    }
    .ag-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;
  document.head.appendChild(style);

  // ── State ──
  let isActive = false;
  let annotations = [];
  let hoveredElement = null;
  let currentTargetInfo = null;

  // ── Create UI Elements ──
  const toggleBtn = document.createElement('div');
  toggleBtn.id = 'ag-toolbar-btn';
  toggleBtn.innerHTML = `<div class="ag-dot"></div><span>Agentation</span>`;
  document.body.appendChild(toggleBtn);

  const controls = document.createElement('div');
  controls.id = 'ag-controls';
  controls.innerHTML = `
    <div class="ag-header">
      <span>Visual Feedback</span>
      <span class="ag-count-badge" id="ag-pin-count">0 notes</span>
    </div>
    <div class="ag-help-text">Click any element on page to add feedback note.</div>
    <div class="ag-btn-row">
      <button class="ag-action-btn primary" id="ag-copy-btn">📋 Copy Notes</button>
      <button class="ag-action-btn" id="ag-clear-btn">🗑️ Clear</button>
    </div>
  `;
  document.body.appendChild(controls);

  const highlighter = document.createElement('div');
  highlighter.id = 'ag-highlighter';
  highlighter.innerHTML = `<div id="ag-highlighter-tag"></div>`;
  document.body.appendChild(highlighter);
  const highlighterTag = document.getElementById('ag-highlighter-tag');

  const modal = document.createElement('div');
  modal.id = 'ag-modal';
  modal.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#f8fafc">Add Feedback Note</div>
    <div id="ag-modal-target"></div>
    <textarea id="ag-modal-input" placeholder="e.g., Make this button wider, change color to tint blue..."></textarea>
    <div class="ag-modal-actions">
      <button class="ag-action-btn" id="ag-modal-cancel">Cancel</button>
      <button class="ag-action-btn primary" id="ag-modal-save">Add Note</button>
    </div>
  `;
  document.body.appendChild(modal);

  const modalInput = document.getElementById('ag-modal-input');
  const modalTarget = document.getElementById('ag-modal-target');

  // ── Helper: Get unique selector path ──
  function getSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    if (el.id) return '#' + el.id;
    let path = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.split(' ').filter(c => c && !c.startsWith('ag-')).join('.');
      if (cls) path += '.' + cls;
    }
    let parent = el.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      return getSelector(parent) + ' > ' + path;
    }
    return path;
  }

  // ── Toggle Agentation Active Mode ──
  toggleBtn.addEventListener('click', () => {
    isActive = !isActive;
    toggleBtn.classList.toggle('active', isActive);
    controls.style.display = isActive ? 'flex' : 'none';
    if (!isActive) {
      highlighter.style.display = 'none';
      modal.style.display = 'none';
    }
  });

  // ── Mouse Move Hover Inspector ──
  document.addEventListener('mousemove', (e) => {
    if (!isActive || modal.style.display === 'flex') return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.closest('#ag-toolbar-btn, #ag-controls, #ag-modal, .ag-pin')) {
      highlighter.style.display = 'none';
      hoveredElement = null;
      return;
    }

    hoveredElement = target;
    const rect = target.getBoundingClientRect();
    highlighter.style.display = 'block';
    highlighter.style.top = rect.top + 'px';
    highlighter.style.left = rect.left + 'px';
    highlighter.style.width = rect.width + 'px';
    highlighter.style.height = rect.height + 'px';

    const tag = target.tagName.toLowerCase();
    const id = target.id ? '#' + target.id : '';
    const cls = (typeof target.className === 'string')
      ? '.' + target.className.split(' ').filter(c => c && !c.startsWith('ag-'))[0] || ''
      : '';
    highlighterTag.textContent = `${tag}${id}${cls} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
  });

  // ── Click to Annotate ──
  document.addEventListener('click', (e) => {
    if (!isActive) return;
    if (e.target.closest('#ag-toolbar-btn, #ag-controls, #ag-modal, .ag-pin')) return;

    e.preventDefault();
    e.stopPropagation();

    if (!hoveredElement) return;

    const rect = hoveredElement.getBoundingClientRect();
    const selector = getSelector(hoveredElement);
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    currentTargetInfo = {
      element: hoveredElement.tagName.toLowerCase(),
      selector: selector,
      text: (hoveredElement.innerText || '').slice(0, 60).trim(),
      rect: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      clickPos: {
        x: e.pageX,
        y: e.pageY
      }
    };

    // Open Modal
    modalTarget.textContent = selector;
    modalInput.value = '';
    modal.style.display = 'flex';
    modal.style.top = Math.min(e.clientY + 12, window.innerHeight - 200) + 'px';
    modal.style.left = Math.min(e.clientX + 12, window.innerWidth - 320) + 'px';
    modalInput.focus();
  }, true);

  // ── Modal Actions ──
  document.getElementById('ag-modal-cancel').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('ag-modal-save').addEventListener('click', () => {
    const comment = modalInput.value.trim();
    if (!comment || !currentTargetInfo) return;

    const pinIndex = annotations.length + 1;
    const pin = document.createElement('div');
    pin.className = 'ag-pin';
    pin.textContent = pinIndex;
    pin.style.left = currentTargetInfo.clickPos.x + 'px';
    pin.style.top = currentTargetInfo.clickPos.y + 'px';
    pin.title = `${currentTargetInfo.selector}: ${comment}`;
    document.body.appendChild(pin);

    annotations.push({
      index: pinIndex,
      comment: comment,
      element: currentTargetInfo.element,
      selector: currentTargetInfo.selector,
      text: currentTargetInfo.text,
      rect: currentTargetInfo.rect,
      pinElement: pin
    });

    document.getElementById('ag-pin-count').textContent = annotations.length + (annotations.length === 1 ? ' note' : ' notes');
    modal.style.display = 'none';
  });

  // ── Copy Markdown Feedback ──
  document.getElementById('ag-copy-btn').addEventListener('click', () => {
    if (annotations.length === 0) {
      alert('No annotations yet. Click on any element to add notes first!');
      return;
    }

    let md = `### Visual Feedback (Agentation Annotations)\n`;
    md += `URL: ${window.location.href}\n\n`;

    annotations.forEach((a) => {
      md += `#### [${a.index}] ${a.selector}\n`;
      md += `- **Note**: ${a.comment}\n`;
      md += `- **Dimensions**: ${a.rect.width}px × ${a.rect.height}px (at x: ${a.rect.x}, y: ${a.rect.y})\n`;
      if (a.text) md += `- **Target Text**: "${a.text}"\n`;
      md += `\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      const btn = document.getElementById('ag-copy-btn');
      btn.textContent = '✓ Copied Markdown!';
      setTimeout(() => btn.textContent = '📋 Copy Notes', 2000);
    });
  });

  // ── Clear All Notes ──
  document.getElementById('ag-clear-btn').addEventListener('click', () => {
    annotations.forEach(a => a.pinElement.remove());
    annotations = [];
    document.getElementById('ag-pin-count').textContent = '0 notes';
  });
})();
