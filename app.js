let targetSize = 1500;
let outputFormat = 'image/jpeg';
let quality = 0.85;
let ratio = '1:1';
let customW = null;
let customH = null;
let items = [];
let idCounter = 0;
let processing = false;
let rmThumbUrls = [];
let bgColor = 'transparent';
let sharpness = 0;
let autoCrop = false;
let sizeMode = false;
let targetKB = 300;
let padding = 0;
let viewMode = 'grid';
let filterStatus = 'all';
let searchQuery = '';
let undoStack = [];

function saveSettings() {
  localStorage.setItem('imgOptSettings', JSON.stringify({
    targetSize, outputFormat, quality, ratio, customW, customH,
    noUpscale: $('noUpscale').checked, bgColor, sharpness, autoCrop,
    sizeMode, targetKB, padding
  }));
}

const $ = id => document.getElementById(id);

function init() {
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  // Browser compatibility check
  (function checkBrowserSupport() {
    const missing = [];
    if (typeof Worker === 'undefined') missing.push('Web Workers');
    if (typeof OffscreenCanvas === 'undefined') missing.push('OffscreenCanvas');
    if (typeof createImageBitmap === 'undefined') missing.push('createImageBitmap');
    if (missing.length === 0) return;

    const notice = document.createElement('div');
    notice.className = 'compat-notice';
    notice.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p><strong>Webbläsaren stöds inte.</strong> E37 Image Optimizer kräver en modern webbläsare — Chrome, Edge eller Safari 16.4+. (Saknar: ${missing.join(', ')})</p>`;
    const landing = $('landing');
    landing.insertBefore(notice, landing.firstChild);
    $('dropZone').style.pointerEvents = 'none';
    $('dropZone').style.opacity = '0.45';
    $('browseBtn').disabled = true;
    $('testImagesBtn').disabled = true;
  })();

  // Landing entrance animation
  gsap.set(['.lp-hero', '#dropZone', '.drop-test'], { opacity: 0, y: 18 });
  gsap.set('.lp-feat', { opacity: 0, y: 22 });
  gsap.set('.lp-steps', { opacity: 0, y: 12 });
  gsap.timeline({ delay: 0.05 })
    .to('.lp-hero',    { opacity: 1, y: 0, duration: 0.5,  ease: 'power2.out' })
    .to('#dropZone',   { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.38')
    .to('.drop-test',  { opacity: 1, y: 0, duration: 0.3,  ease: 'power2.out' }, '-=0.3')
    .to('.lp-feat',    { opacity: 1, y: 0, stagger: 0.08,  duration: 0.4,  ease: 'power2.out' }, '-=0.25')
    .to('.lp-steps',   { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '-=0.3');

  // Pulsing drop icon (starts after entrance)
  gsap.to('.drop-icon', { scale: 1.1, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 });

  // Feature card hover
  document.querySelectorAll('.lp-feat').forEach(card => {
    card.addEventListener('mouseenter', () => gsap.to(card, { y: -5, duration: 0.2, ease: 'power2.out' }));
    card.addEventListener('mouseleave', () => gsap.to(card, { y: 0,  duration: 0.2, ease: 'power2.out' }));
  });

  // File System Access API support
  if (typeof window.showDirectoryPicker !== 'undefined') {
    document.body.classList.add('fs-supported');
    $('folderBtn').onclick    = pickFolder;
    $('addFolderBtn').onclick = pickFolder;
    $('saveFolderBtn').onclick = saveToFolder;
  }

  // Theme
  const saved = localStorage.getItem('imgOptTheme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  $('themeBtn').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('imgOptTheme', next);
  };

  // Drop zone
  const dz = $('dropZone');
  dz.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dz.classList.contains('drag-over')) {
      dz.classList.add('drag-over');
      gsap.to(dz, { scale: 1.015, duration: 0.2, ease: 'power2.out' });
    }
  });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) {
      dz.classList.remove('drag-over');
      gsap.to(dz, { scale: 1, duration: 0.18, ease: 'power2.inOut' });
    }
  });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    gsap.to(dz, { scale: 1, duration: 0.12, ease: 'power2.in' });
    addFiles(e.dataTransfer.files);
  });
  $('browseBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('addMoreBtn').onclick = () => $('fileInput').click();

  // Toolbar: search
  $('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    applyFilters();
  });

  // Toolbar: filter pills
  document.querySelectorAll('.wt-filter').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.wt-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterStatus = btn.dataset.filter;
      applyFilters();
    };
  });

  // Toolbar: view toggle
  $('viewGrid').onclick = () => {
    viewMode = 'grid';
    $('imageGrid').classList.remove('list-view');
    $('viewGrid').classList.add('active');
    $('viewList').classList.remove('active');
    localStorage.setItem('imgOptView', 'grid');
  };
  $('viewList').onclick = () => {
    viewMode = 'list';
    $('imageGrid').classList.add('list-view');
    $('viewList').classList.add('active');
    $('viewGrid').classList.remove('active');
    localStorage.setItem('imgOptView', 'list');
  };
  const savedView = localStorage.getItem('imgOptView');
  if (savedView === 'list') $('viewList').click();

  // Ratio cards
  $('ratioPills').querySelectorAll('[data-ratio]').forEach(btn => {
    btn.onclick = () => {
      $('ratioPills').querySelectorAll('[data-ratio]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ratio = btn.dataset.ratio;
      const isCustom = ratio === 'custom';
      $('sizeGroup').classList.toggle('hidden', isCustom);
      $('customDimsGroup').classList.toggle('hidden', !isCustom);
      updateSizeUnit();
    };
  });

  // Size pills
  $('sizePills').querySelectorAll('.pill[data-size]').forEach(btn => {
    btn.onclick = () => {
      $('sizePills').querySelectorAll('.pill[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      targetSize = parseInt(btn.dataset.size);
      $('sizeCustom').value = targetSize;
      updateSizeUnit();
    };
  });

  // Size custom input
  $('sizeCustom').oninput = e => {
    const val = Math.max(100, Math.min(8000, parseInt(e.target.value) || 100));
    targetSize = val;
    $('sizePills').querySelectorAll('.pill[data-size]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.size) === val);
    });
    updateSizeUnit();
  };

  // Custom dims — leaving height blank means "auto": keep each image's own
  // aspect ratio instead of forcing one fixed height for the whole batch.
  $('customW').oninput = e => {
    const v = e.target.value.trim();
    customW = v === '' ? null : Math.max(100, parseInt(v) || 1000);
  };
  $('customH').oninput = e => {
    const v = e.target.value.trim();
    customH = v === '' ? null : Math.max(100, parseInt(v) || 1000);
  };

  // Format pills
  const setFormat = (fmt) => {
    outputFormat = fmt;
    ['fmtJpg', 'fmtWebp', 'fmtPng'].forEach(id => $(''+id).classList.remove('active'));
    $({ 'image/jpeg': 'fmtJpg', 'image/webp': 'fmtWebp', 'image/png': 'fmtPng' }[fmt]).classList.add('active');
    $('qualityGroup').classList.toggle('hidden', fmt === 'image/png');
    $('bgGroup').classList.toggle('hidden', fmt !== 'image/png');
    $('webpWarn').classList.toggle('hidden', fmt !== 'image/webp');
    updatePngWarn();
  };
  $('fmtJpg').onclick = () => setFormat('image/jpeg');
  $('fmtWebp').onclick = () => setFormat('image/webp');
  $('fmtPng').onclick  = () => setFormat('image/png');

  // Quality
  $('qualitySlider').oninput = e => { quality = parseInt(e.target.value) / 100; $('qualityVal').textContent = e.target.value; saveSettings(); };

  // Size mode (begränsa filstorlek)
  $('sizeModeChk').onchange = e => {
    sizeMode = e.target.checked;
    $('targetSizeRow').classList.toggle('hidden', !sizeMode);
    $('qualitySlider').disabled = sizeMode;
    saveSettings();
  };
  $('targetKBInput').oninput = e => { targetKB = Math.max(50, parseInt(e.target.value) || 300); saveSettings(); };

  // Sharpness
  $('sharpenSlider').oninput = e => { sharpness = parseInt(e.target.value); $('sharpenVal').textContent = e.target.value; saveSettings(); };

  // Padding
  $('paddingSlider').oninput = e => { padding = parseInt(e.target.value); $('paddingVal').textContent = e.target.value; saveSettings(); };

  // Auto-crop
  $('autoCropChk').onchange = e => { autoCrop = e.target.checked; saveSettings(); };

  // Advanced accordion
  // Advanced accordion — GSAP height animation
  const advBody = $('advancedSection').querySelector('.sp-advanced-body');
  const advChevron = $('advancedSection').querySelector('.sp-advanced-chevron');
  $('advancedToggle').onclick = () => {
    const section = $('advancedSection');
    const isOpen = section.classList.contains('open');
    if (isOpen) {
      section.classList.remove('open');
      gsap.to(advBody, { height: 0, duration: 0.25, ease: 'power2.inOut' });
      gsap.to(advChevron, { rotation: 0, duration: 0.25, ease: 'power2.inOut' });
    } else {
      section.classList.add('open');
      const h = advBody.scrollHeight;
      gsap.fromTo(advBody, { height: 0 }, { height: h, duration: 0.28, ease: 'power2.out',
        onComplete: () => gsap.set(advBody, { height: 'auto' }) });
      gsap.to(advChevron, { rotation: 180, duration: 0.28, ease: 'power2.out' });
    }
  };

  // Info tooltips — position: fixed to escape overflow clipping
  document.querySelectorAll('.info-tip').forEach(tip => {
    const box = tip.querySelector('.info-tip-box');
    if (!box) return;
    const show = () => {
      const r = tip.getBoundingClientRect();
      box.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      box.style.right = (window.innerWidth - r.right) + 'px';
      box.style.display = 'block';
    };
    const hide = () => { box.style.display = 'none'; };
    tip.addEventListener('mouseenter', show);
    tip.addEventListener('focus', show);
    tip.addEventListener('mouseleave', hide);
    tip.addEventListener('blur', hide);
  });

  // Comparison slider drag
  const compare = $('lbCompare');
  let dragging = false;
  compare.addEventListener('pointerdown', e => {
    e.preventDefault();
    dragging = true;
    compare.setPointerCapture(e.pointerId);
    updateSlider(e);
  });
  compare.addEventListener('pointermove', e => { if (dragging) updateSlider(e); });
  compare.addEventListener('pointerup', () => { dragging = false; });
  compare.addEventListener('pointercancel', () => { dragging = false; });
  function updateSlider(e) {
    const r = compare.getBoundingClientRect();
    setSliderPct(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
  }

  // Lightbox
  $('lbOverlay').onclick = e => { if (e.target === $('lbOverlay') || e.target === $('lbContent')) closePreview(); };
  $('lbClose').onclick = closePreview;
  document.addEventListener('keydown', e => {
    if ($('lbOverlay').classList.contains('hidden')) return;
    if (e.key === 'Escape') closePreview();
    if (e.key === 'ArrowLeft' && $('lbPrev').style.visibility !== 'hidden') $('lbPrev').click();
    if (e.key === 'ArrowRight' && $('lbNext').style.visibility !== 'hidden') $('lbNext').click();
  });

  // Undo
  $('undoBtn').onclick = undoLast;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if (inField) return;
      e.preventDefault();
      undoLast();
    }
  });

  // Background color swatches
  document.querySelectorAll('.bg-swatch').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bgColor = btn.dataset.color;
    };
  });
  $('bgColorPicker').oninput = e => {
    document.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('active'));
    const btn = $('bgCustomBtn');
    btn.classList.add('active');
    btn.style.background = e.target.value;
    bgColor = e.target.value;
  };

  // Paste images from clipboard
  document.addEventListener('paste', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const files = [...(e.clipboardData?.items || [])]
      .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
      .map(i => i.getAsFile());
    if (files.length) addFiles(files);
  });

  // Grid drag-and-drop sort
  const grid = $('imageGrid');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.card-action-btn');
    if (!btn) return;
    e.stopPropagation(); // prevent the click from also bubbling to card.onclick and opening the lightbox
    const id = parseInt(btn.dataset.id);
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (btn.dataset.action === 'crop') {
      openCropModal(item);
    } else if (btn.dataset.action === 'rotate') {
      pushUndo({ action: 'rotate', itemId: item.id, itemName: item.outName || item.name, prevRotation: item.rotation || 0 });
      item.rotation = ((item.rotation || 0) + 90) % 360;
      const img = $('card-' + id)?.querySelector('img');
      if (img) img.style.transform = item.rotation ? `rotate(${item.rotation}deg)` : '';
      item.status = 'pending';
      item.blob = null;
      const statusEl = $('status-' + id);
      if (statusEl) { statusEl.className = 'card-status pending'; statusEl.textContent = 'Väntar'; }
      $('card-' + id)?.classList.remove('done', 'processing', 'error');
      $('card-' + id)?.classList.add('img-card');
    } else if (btn.dataset.action === 'remove') {
      const cardEl = $('card-' + id);
      const idx = items.indexOf(item);
      pushUndo({ action: 'remove', item, index: idx, itemName: item.outName || item.name });
      items.splice(idx, 1);
      const goToLanding = items.length === 0;
      const afterRemove = () => {
        updateProcessBtn();
        if (goToLanding) {
          $('workArea').classList.add('hidden');
          $('landing').classList.remove('hidden');
          $('postProcessBtns').classList.add('hidden');
          $('summaryText').textContent = '';
        }
      };
      if (cardEl) {
        gsap.to(cardEl, {
          opacity: 0, scale: 0, duration: 0.22, ease: 'back.in(1.4)',
          onComplete: () => {
            gsap.to(cardEl, {
              width: 0, minWidth: 0, padding: 0, margin: 0,
              duration: 0.18, ease: 'power2.inOut',
              onComplete: () => { cardEl.remove(); afterRemove(); updateDuplicateWarnings(); }
            });
          }
        });
      } else {
        afterRemove();
      }
    }
  });

  let dragSrc = null;
  grid.addEventListener('dragstart', e => {
    dragSrc = e.target.closest('.img-card');
    if (!dragSrc) return;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => dragSrc.classList.add('dragging'), 0);
  });
  grid.addEventListener('dragend', () => {
    if (dragSrc) dragSrc.classList.remove('dragging');
    grid.querySelectorAll('.img-card').forEach(c => c.classList.remove('drag-before', 'drag-after'));
    dragSrc = null;
  });
  grid.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.img-card');
    if (!target || target === dragSrc) return;
    grid.querySelectorAll('.img-card').forEach(c => c.classList.remove('drag-before', 'drag-after'));
    const r = target.getBoundingClientRect();
    target.classList.add(e.clientX < r.left + r.width / 2 ? 'drag-before' : 'drag-after');
  });
  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget))
      grid.querySelectorAll('.img-card').forEach(c => c.classList.remove('drag-before', 'drag-after'));
  });
  grid.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.img-card');
    if (!target || !dragSrc || target === dragSrc) return;
    const r = target.getBoundingClientRect();
    e.clientX < r.left + r.width / 2
      ? grid.insertBefore(dragSrc, target)
      : grid.insertBefore(dragSrc, target.nextSibling);
    const ordered = [...grid.querySelectorAll('.img-card')]
      .map(c => items.find(i => i.id === parseInt(c.id.replace('card-', ''))))
      .filter(Boolean);
    items.length = 0;
    ordered.forEach(i => items.push(i));
    grid.querySelectorAll('.img-card').forEach(c => c.classList.remove('drag-before', 'drag-after'));
  });

  // Persist settings on any interaction in settings panel
  document.querySelector('.sp').addEventListener('click', saveSettings);
  document.querySelector('.sp').addEventListener('input', saveSettings);

  // Load saved settings
  try {
    const s = JSON.parse(localStorage.getItem('imgOptSettings'));
    if (s) {
      if (s.ratio) {
        ratio = s.ratio;
        $('ratioPills').querySelectorAll('[data-ratio]').forEach(b =>
          b.classList.toggle('active', b.dataset.ratio === s.ratio));
        $('sizeGroup').classList.toggle('hidden', s.ratio === 'custom');
        $('customDimsGroup').classList.toggle('hidden', s.ratio !== 'custom');
      }
      if ('customW' in s) {
        customW = s.customW;
        $('customW').value = customW == null ? '' : customW;
      }
      if ('customH' in s) {
        customH = s.customH;
        $('customH').value = customH == null ? '' : customH;
      }
      if (s.targetSize) {
        targetSize = s.targetSize;
        $('sizeCustom').value = s.targetSize;
        $('sizePills').querySelectorAll('.pill[data-size]').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.size) === s.targetSize));
        updateSizeUnit();
      }
      if (s.outputFormat) setFormat(s.outputFormat);
      if (s.quality) {
        quality = s.quality;
        const pct = Math.round(s.quality * 100);
        $('qualitySlider').value = pct;
        $('qualityVal').textContent = pct;
      }
      if (typeof s.noUpscale === 'boolean') $('noUpscale').checked = s.noUpscale;
      if (typeof s.sharpness === 'number') {
        sharpness = s.sharpness;
        $('sharpenSlider').value = s.sharpness;
        $('sharpenVal').textContent = s.sharpness;
      }
      if (typeof s.autoCrop === 'boolean') { autoCrop = s.autoCrop; $('autoCropChk').checked = s.autoCrop; }
      if (typeof s.sizeMode === 'boolean' && s.sizeMode) {
        sizeMode = true;
        $('sizeModeChk').checked = true;
        $('targetSizeRow').classList.remove('hidden');
        $('qualitySlider').disabled = true;
      }
      if (s.targetKB) { targetKB = s.targetKB; $('targetKBInput').value = s.targetKB; }
      if (typeof s.padding === 'number') {
        padding = s.padding;
        $('paddingSlider').value = s.padding;
        $('paddingVal').textContent = s.padding;
      }
      if (s.bgColor) {
        bgColor = s.bgColor;
        document.querySelectorAll('.bg-swatch').forEach(b =>
          b.classList.toggle('active', b.dataset.color === s.bgColor));
        if (s.bgColor !== 'transparent') $('bgColorPicker').value = s.bgColor;
      }
    }
  } catch {}

  // Actions
  $('processBtn').onclick = () => {
    gsap.fromTo($('processBtn'), { scale: 0.95 }, { scale: 1, duration: 0.35, ease: 'elastic.out(1, 0.4)' });
    processAll();
  };
  $('downloadBtn').onclick = downloadZip;
  $('testImagesBtn').onclick = loadTestImages;
  $('renameAllBtn').onclick = openRenameModal;
  $('clearAllBtn').onclick = clearAll;
  $('rmClose').onclick = closeRenameModal;
  $('rmCancel').onclick = closeRenameModal;
  $('rmSave').onclick = saveRenameModal;
  $('rmOverlay').addEventListener('click', e => { if (e.target === $('rmOverlay')) closeRenameModal(); });
  $('metaClose').onclick = closeMetaPanel;
  $('metaCloseBtn').onclick = closeMetaPanel;
  $('metaOverlay').addEventListener('click', e => { if (e.target === $('metaOverlay')) closeMetaPanel(); });
  $('cropClose').onclick = closeCropModal;
  $('cropCancelBtn').onclick = closeCropModal;
  $('cropApplyBtn').onclick = applyCropModal;
  $('cropResetBtn').onclick = resetCropModal;
  $('cropOverlay').addEventListener('click', e => { if (e.target === $('cropOverlay')) closeCropModal(); });
  initCropModal();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('rmOverlay').classList.contains('hidden')) closeRenameModal();
    if (e.key === 'Escape' && !$('metaOverlay').classList.contains('hidden')) closeMetaPanel();
    if (e.key === 'Escape' && !$('cropOverlay').classList.contains('hidden')) closeCropModal();
    if (e.ctrlKey && e.key === 'Enter' && !$('workArea').classList.contains('hidden') && !processing) $('processBtn').click();
  });

  const applyArtnr = () => {
    const artnr = $('rmArtnr').value.trim().replace(/[<>:"/\\|?*\[\]]/g, '');
    const prefix = $('rmPrefixA').classList.contains('active') ? 'a' : 'v';
    const preview = $('rmArtnrPreview');
    if (artnr) {
      preview.textContent = prefix + artnr + '[1].jpg, ' + prefix + artnr + '[2].jpg …';
    } else {
      preview.textContent = 'a12345[1].jpg, a12345[2].jpg …';
    }
    document.querySelectorAll('#rmBody .rm-input').forEach((input, idx) => {
      input.value = artnr ? prefix + artnr + '[' + (idx + 1) + ']' : '';
      input.closest('.rm-new').querySelectorAll('.rename-prefix').forEach(b =>
        b.classList.toggle('active', input.value[0] === b.dataset.prefix));
    });
  };

  $('rmArtnr').addEventListener('input', applyArtnr);
  ['rmPrefixA', 'rmPrefixV'].forEach(id => {
    $(id).onmousedown = e => e.preventDefault();
    $(id).onclick = () => {
      $('rmPrefixA').classList.toggle('active', id === 'rmPrefixA');
      $('rmPrefixV').classList.toggle('active', id === 'rmPrefixV');
      applyArtnr();
    };
  });
}

async function loadTestImages() {
  const btn = $('testImagesBtn');
  btn.disabled = true;
  btn.textContent = 'Hämtar…';

  const specs = [
    { seed: 11, w: 1200, h: 1200 },
    { seed: 22, w: 900,  h: 1200 },
    { seed: 33, w: 1400, h: 1050 },
    { seed: 44, w: 1200, h: 1200 },
    { seed: 55, w: 800,  h: 1000 },
    { seed: 66, w: 1500, h: 900  },
    { seed: 77, w: 1000, h: 1250 },
    { seed: 88, w: 1300, h: 1300 },
    { seed: 99, w: 950,  h: 1200 },
    { seed: 10, w: 1600, h: 1200 },
    { seed: 12, w: 1100, h: 1100 },
    { seed: 13, w: 700,  h: 875  },
    { seed: 14, w: 1500, h: 1500 },
    { seed: 15, w: 1200, h: 960  },
    { seed: 16, w: 850,  h: 1063 },
    { seed: 17, w: 1350, h: 1350 },
    { seed: 18, w: 600,  h: 750  },
    { seed: 19, w: 1400, h: 1400 },
  ];

  try {
    const blobs = await Promise.all(
      specs.map(s => fetch(`https://picsum.photos/seed/${s.seed}/${s.w}/${s.h}`).then(r => r.blob()))
    );
    const files = blobs.map((blob, i) => {
      const s = specs[i];
      return new File([blob], `test-${s.seed}-${s.w}x${s.h}.jpg`, { type: 'image/jpeg' });
    });
    addFiles(files);
  } catch {
    btn.textContent = 'Kunde inte hämta';
    setTimeout(() => { btn.textContent = 'ladda några testbilder'; btn.disabled = false; }, 2500);
    return;
  }

  btn.textContent = 'ladda några testbilder';
  btn.disabled = false;
}

function addFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;

  $('landing').classList.add('hidden');
  $('workArea').classList.remove('hidden');

  const newCards = [];
  imgs.forEach(file => {
    const id = ++idCounter;
    const item = { id, file, name: file.name, originalSize: file.size, originalW: 0, originalH: 0, status: 'pending', blob: null, outName: '' };
    items.push(item);
    appendCard(item);
    newCards.push($('card-' + id));
  });

  newCards.forEach(card => {
    gsap.set(card, { opacity: 0, y: -30, scale: 0.9 });
  });
  gsap.to(newCards, {
    opacity: 1, y: 0, scale: 1,
    duration: 0.35,
    ease: 'power2.out',
    stagger: Math.min(0.06, 0.4 / newCards.length),
    clearProps: 'all'
  });

  updateProcessBtn();
  updatePngWarn();
  updateDuplicateWarnings();
  const n = imgs.length;
  showToast(n === 1 ? '1 bild tillagd' : `${n} bilder tillagda`);
}

function pushUndo(step) {
  undoStack.push(step);
  if (undoStack.length > 30) undoStack.shift();
  updateUndoBtn();
}

function updateUndoBtn() {
  const btn = $('undoBtn');
  if (!btn) return;
  btn.disabled = undoStack.length === 0;
  const step = undoStack[undoStack.length - 1];
  const labels = { rotate: 'rotation', crop: 'beskärning', remove: 'borttagning' };
  btn.title = step ? `Ångra: ${labels[step.action] || step.action} av ${trimName(step.itemName || '')}` : 'Ångra';
}

function markPendingAfterEdit(item) {
  if (item.status === 'done') {
    item.status = 'pending';
    item.blob = null;
    const statusEl = $('status-' + item.id);
    if (statusEl) { statusEl.className = 'card-status pending'; statusEl.textContent = 'Väntar'; }
    const cardEl = $('card-' + item.id);
    cardEl?.classList.remove('done', 'processing', 'error');
    cardEl?.classList.add('img-card');
  }
}

function undoLast() {
  const step = undoStack.pop();
  updateUndoBtn();
  if (!step) return;

  if (step.action === 'rotate') {
    const item = items.find(i => i.id === step.itemId);
    if (!item) return;
    item.rotation = step.prevRotation;
    const img = $('card-' + item.id)?.querySelector('.card-thumb img');
    if (img) img.style.transform = item.rotation ? `rotate(${item.rotation}deg)` : '';
    markPendingAfterEdit(item);
  } else if (step.action === 'crop') {
    const item = items.find(i => i.id === step.itemId);
    if (!item) return;
    item.manualCrop = step.prevManualCrop;
    const badge = document.querySelector('#card-' + item.id + ' .card-crop-badge');
    if (badge) badge.classList.toggle('hidden', !item.manualCrop);
    markPendingAfterEdit(item);
  } else if (step.action === 'remove') {
    const wasEmpty = items.length === 0;
    items.splice(step.index, 0, step.item);
    appendCard(step.item);
    const cardEl = $('card-' + step.item.id);
    const gridEl = $('imageGrid');
    if (cardEl && gridEl) {
      const ref = gridEl.children[step.index];
      if (ref && ref !== cardEl) gridEl.insertBefore(cardEl, ref);
      gsap.set(cardEl, { opacity: 0, scale: 0.9 });
      gsap.to(cardEl, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,scale' });
    }
    updateProcessBtn();
    updateDuplicateWarnings();
    if (wasEmpty) {
      $('landing').classList.add('hidden');
      $('workArea').classList.remove('hidden');
    }
  }
  showToast('Ångrat');
}

function updateDuplicateWarnings() {
  const counts = {};
  items.forEach(i => { counts[i.name] = (counts[i.name] || 0) + 1; });
  items.forEach(item => {
    const card = $('card-' + item.id);
    if (!card) return;
    const body = card.querySelector('.card-body');
    let warn = body.querySelector('.card-dupwarn');
    if (counts[item.name] > 1) {
      if (!warn) {
        warn = document.createElement('div');
        warn.className = 'card-dupwarn';
        warn.textContent = '⚠ Dubblettfilnamn';
        body.appendChild(warn);
      }
    } else {
      if (warn) warn.remove();
    }
  });
}

function appendCard(item) {
  const url = URL.createObjectURL(item.file);
  const card = document.createElement('div');
  card.className = 'img-card';
  card.id = 'card-' + item.id;
  card.draggable = true;
  card.style.opacity = '0';
  card.innerHTML = `
    <div class="card-thumb">
      <img src="${url}" alt="" loading="lazy" draggable="false">
      <div class="card-drag-handle">
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
          <circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/>
          <circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/>
        </svg>
      </div>
      <button class="card-exif-badge hidden" data-id="${item.id}" title="EXIF-orientering upptäckt – klicka för information">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        EXIF
      </button>
      <div class="card-actions">
        <button class="card-action-btn" data-action="crop" data-id="${item.id}" title="Beskär">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
        </button>
        <button class="card-action-btn" data-action="rotate" data-id="${item.id}" title="Rotera 90°">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="card-action-btn" data-action="remove" data-id="${item.id}" title="Ta bort">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <button class="card-crop-badge hidden" data-id="${item.id}" title="Manuell beskärning aktiv – klicka för att redigera">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
        Beskuren
      </button>
    </div>
    <div class="card-body">
      <div class="card-name" title="${esc(item.name)}">${esc(trimName(item.name))}</div>
      <div class="card-meta" id="meta-${item.id}">${formatBytes(item.originalSize)}</div>
      <div class="card-status pending" id="status-${item.id}">Väntar</div>
    </div>`;
  $('imageGrid').appendChild(card);

  card.querySelector('.card-exif-badge').onclick = e => { e.stopPropagation(); openMetaPanel(item.id); };
  card.querySelector('.card-crop-badge').onclick = e => { e.stopPropagation(); openCropModal(item); };

  card.style.cursor = 'pointer';
  card.onclick = e => {
    if (e.target.closest('.card-actions, .card-exif-badge, .card-crop-badge')) return;
    openPreview(item.id);
  };

  card.addEventListener('mouseenter', () => {
    if (!card.classList.contains('dragging') && viewMode === 'grid')
      gsap.to(card, { y: -4, duration: 0.2, ease: 'power2.out' });
  });
  card.addEventListener('mouseleave', () => {
    gsap.to(card, { y: 0, duration: 0.2, ease: 'power2.out' });
  });

  const img = card.querySelector('img');
  img.onload = () => {
    item.originalW = img.naturalWidth;
    item.originalH = img.naturalHeight;
    const el = $('meta-' + item.id);
    if (el) el.textContent = item.originalW + '\xD7' + item.originalH + ' \xB7 ' + formatBytes(item.originalSize);
    URL.revokeObjectURL(url);
    const [cw, ch] = getCanvasDims(targetSize, item);
    const scale = Math.min(cw / item.originalW, ch / item.originalH);
    const body = card.querySelector('.card-body');
    if (scale > 1.5) {
      const w = document.createElement('div');
      w.className = 'card-lowres';
      w.textContent = '⚠ Lågupplöst källbild';
      body.appendChild(w);
    }
    const fittedW = item.originalW * scale, fittedH = item.originalH * scale;
    const coverage = (fittedW * fittedH) / (cw * ch);
    if (coverage < 0.65) {
      const p = document.createElement('div');
      p.className = 'card-propratio';
      p.textContent = '⚠ Proportioner avviker från canvas';
      body.appendChild(p);
    }
  };

  // Detect EXIF orientation up front and flag it on the card, since this is
  // exactly the kind of metadata mismatch (e.g. Orientation = 3) that can
  // make an image look correct in the OS/desktop viewer but end up rotated
  // after being uploaded elsewhere if not normalized consistently.
  if (typeof exifr !== 'undefined') {
    exifr.orientation(item.file).then(o => {
      item.exifOrientation = o || 1;
      updateExifBadge(item);
    }).catch(() => { item.exifOrientation = 1; });
  } else {
    item.exifOrientation = 1;
  }
}

function updateExifBadge(item) {
  const badge = document.querySelector('#card-' + item.id + ' .card-exif-badge');
  if (!badge) return;
  badge.classList.toggle('hidden', !item.exifOrientation || item.exifOrientation === 1);
  badge.classList.toggle('badge-ignored', !!item.ignoreExifOrientation);
  badge.title = item.ignoreExifOrientation
    ? 'EXIF-orientering ignoreras för den här bilden – klicka för information'
    : 'EXIF-orientering upptäckt – normaliseras automatiskt. Klicka för information';
}

function describeExifOrientation(o) {
  switch (o) {
    case 1: return 'Normal – ingen åtgärd behövs';
    case 2: return 'Speglad horisontellt';
    case 3: return 'Roterad 180°';
    case 4: return 'Speglad vertikalt';
    case 5: return 'Speglad + roterad 90° moturs';
    case 6: return 'Roterad 90° medurs';
    case 7: return 'Speglad + roterad 90° medurs';
    case 8: return 'Roterad 90° moturs';
    default: return 'Ingen EXIF-orientering hittad';
  }
}

function openMetaPanel(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const body = $('metaBody');
  body.innerHTML = '';

  const addRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = `<span class="meta-label">${esc(label)}</span><span class="meta-value">${value}</span>`;
    body.appendChild(row);
  };

  addRow('Filnamn', esc(item.name));
  addRow('Dimensioner', item.originalW && item.originalH ? item.originalW + '×' + item.originalH + ' px' : '\u2013');
  addRow('Filstorlek', formatBytes(item.originalSize));
  addRow('EXIF-orientering', esc(describeExifOrientation(item.exifOrientation)));

  if (item.exifOrientation && item.exifOrientation !== 1) {
    const box = document.createElement('div');
    box.className = 'meta-orient-box';
    box.innerHTML = `
      <p class="meta-orient-hint">Bilden normaliseras automatiskt till rätt visningsriktning vid optimering.</p>
      <label class="meta-orient-toggle">
        <input type="checkbox" id="metaIgnoreOrient" ${item.ignoreExifOrientation ? 'checked' : ''}>
        Ignorera EXIF-orientering (behåll bilden orörd, som den ligger lagrad)
      </label>`;
    body.appendChild(box);

    const toggle = box.querySelector('#metaIgnoreOrient');
    toggle.onchange = () => {
      item.ignoreExifOrientation = toggle.checked;
      if (item.status === 'done') {
        item.status = 'pending';
        item.blob = null;
        setStatus(item.id, 'pending', 'Väntar');
        const cardEl = $('card-' + item.id);
        cardEl?.classList.remove('done', 'processing', 'error');
        cardEl?.classList.add('img-card');
      }
      updateExifBadge(item);
    };
  }

  const camRow = document.createElement('div');
  camRow.className = 'meta-row hidden';
  camRow.innerHTML = `<span class="meta-label">Kamera</span><span class="meta-value" id="metaCameraValue"></span>`;
  body.appendChild(camRow);
  if (typeof exifr !== 'undefined') {
    exifr.parse(item.file, ['Make', 'Model', 'FNumber', 'ExposureTime', 'ISOSpeedRatings', 'FocalLength']).then(exif => {
      if (!exif) return;
      const parts = [];
      if (exif.Make || exif.Model) parts.push([exif.Make, exif.Model].filter(Boolean).join(' '));
      if (exif.FocalLength) parts.push(Math.round(exif.FocalLength) + ' mm');
      if (exif.FNumber) parts.push('f/' + exif.FNumber);
      if (exif.ExposureTime) parts.push(exif.ExposureTime < 1 ? '1/' + Math.round(1 / exif.ExposureTime) + 's' : exif.ExposureTime + 's');
      if (exif.ISOSpeedRatings) parts.push('ISO ' + exif.ISOSpeedRatings);
      if (parts.length) {
        camRow.classList.remove('hidden');
        $('metaCameraValue').textContent = parts.join(' · ');
      }
    }).catch(() => {});
  }

  $('metaOverlay').classList.remove('hidden');
}

function closeMetaPanel() {
  $('metaOverlay').classList.add('hidden');
}

// --- Manual crop modal -----------------------------------------------------
let cropItem = null;
let cropImgUrl = null;
// Crop box state stored as fractions (0-1) of the displayed (already
// oriented) image, so it's independent of on-screen zoom/rendered size.
let cropState = { x: 0, y: 0, w: 1, h: 1 };
let cropDrag = null; // { mode: 'move'|'nw'|'ne'|'sw'|'se', startX, startY, start: {...cropState} }

function openCropModal(item) {
  cropItem = item;
  const img = $('cropImg');
  if (cropImgUrl) URL.revokeObjectURL(cropImgUrl);
  cropImgUrl = URL.createObjectURL(item.file);
  img.src = cropImgUrl;

  cropState = item.manualCrop
    ? { ...item.manualCrop }
    : { x: 0, y: 0, w: 1, h: 1 };

  img.onload = () => {
    updateCropBoxUI();
  };

  $('cropOverlay').classList.remove('hidden');
}

function closeCropModal() {
  $('cropOverlay').classList.add('hidden');
  cropItem = null;
}

function updateCropBoxUI() {
  const img = $('cropImg');
  const box = $('cropBox');
  const w = img.clientWidth, h = img.clientHeight;
  if (!w || !h) return;
  box.style.left = (cropState.x * w) + 'px';
  box.style.top = (cropState.y * h) + 'px';
  box.style.width = (cropState.w * w) + 'px';
  box.style.height = (cropState.h * h) + 'px';
}

function clampCropState() {
  cropState.w = Math.max(0.05, Math.min(1, cropState.w));
  cropState.h = Math.max(0.05, Math.min(1, cropState.h));
  cropState.x = Math.max(0, Math.min(1 - cropState.w, cropState.x));
  cropState.y = Math.max(0, Math.min(1 - cropState.h, cropState.y));
}

function initCropModal() {
  const img = $('cropImg');
  const box = $('cropBox');

  const onPointerDown = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const w = img.clientWidth, h = img.clientHeight;
    if (!w || !h) return;
    cropDrag = {
      mode,
      startX: e.clientX, startY: e.clientY,
      startFracX: e.clientX / w, startFracY: e.clientY / h,
      w, h,
      start: { ...cropState }
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  box.addEventListener('pointerdown', onPointerDown('move'));
  box.querySelectorAll('.crop-handle').forEach(h => {
    h.addEventListener('pointerdown', onPointerDown(h.dataset.h));
  });

  function onPointerMove(e) {
    if (!cropDrag) return;
    const dxFrac = (e.clientX - cropDrag.startX) / cropDrag.w;
    const dyFrac = (e.clientY - cropDrag.startY) / cropDrag.h;
    const s = cropDrag.start;
    if (cropDrag.mode === 'move') {
      cropState.x = s.x + dxFrac;
      cropState.y = s.y + dyFrac;
      cropState.w = s.w;
      cropState.h = s.h;
    } else {
      let { x, y, w, h } = s;
      if (cropDrag.mode.includes('n')) { y = s.y + dyFrac; h = s.h - dyFrac; }
      if (cropDrag.mode.includes('s')) { h = s.h + dyFrac; }
      if (cropDrag.mode.includes('w')) { x = s.x + dxFrac; w = s.w - dxFrac; }
      if (cropDrag.mode.includes('e')) { w = s.w + dxFrac; }
      cropState = { x, y, w, h };
    }
    clampCropState();
    updateCropBoxUI();
  }

  function onPointerUp() {
    cropDrag = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  window.addEventListener('resize', () => {
    if (!$('cropOverlay').classList.contains('hidden')) updateCropBoxUI();
  });
}

function applyCropModal() {
  if (!cropItem) return;
  const isFullFrame = cropState.x <= 0.001 && cropState.y <= 0.001 &&
    cropState.w >= 0.999 && cropState.h >= 0.999;
  const newCrop = isFullFrame ? null : { ...cropState };
  const prevCrop = cropItem.manualCrop ? { ...cropItem.manualCrop } : null;
  const unchanged = JSON.stringify(prevCrop) === JSON.stringify(newCrop);
  if (!unchanged) {
    pushUndo({ action: 'crop', itemId: cropItem.id, itemName: cropItem.outName || cropItem.name, prevManualCrop: prevCrop });
  }
  cropItem.manualCrop = newCrop;
  const badge = document.querySelector('#card-' + cropItem.id + ' .card-crop-badge');
  if (badge) badge.classList.toggle('hidden', !cropItem.manualCrop);
  if (cropItem.status === 'done') {
    cropItem.status = 'pending';
    cropItem.blob = null;
    setStatus(cropItem.id, 'pending', 'Väntar');
    const cardEl = $('card-' + cropItem.id);
    cardEl?.classList.remove('done', 'processing', 'error');
    cardEl?.classList.add('img-card');
  }
  closeCropModal();
}

function resetCropModal() {
  cropState = { x: 0, y: 0, w: 1, h: 1 };
  updateCropBoxUI();
}

function getCanvasDims(size, item) {
  if (ratio === '1:1') return [size, size];
  if (ratio === '4:5') return [size, Math.round(size * 5 / 4)];
  // Custom ratio: any dimension left blank ("auto") keeps this specific
  // image's own aspect ratio for that axis, instead of a shared fixed value.
  // Leaving both blank keeps the image at its own (possibly cropped) size —
  // useful when the user only wants to crop/normalize metadata without
  // resizing at all.
  const hasOrig = item && item.originalW && item.originalH;
  if (customW == null && customH == null) {
    if (hasOrig) return [item.originalW, item.originalH];
    return [size, size]; // fallback until the image's own dimensions are known
  }
  if (customW == null) {
    if (hasOrig) return [Math.round(customH * item.originalW / item.originalH), customH];
    return [customH, customH];
  }
  if (customH == null) {
    if (hasOrig) return [customW, Math.round(customW * item.originalH / item.originalW)];
    return [customW, customW]; // fallback until the image's own dimensions are known
  }
  return [customW, customH];
}

function updateSizeUnit() {
  const el = $('sizeUnit');
  if (!el) return;
  const [cw, ch] = getCanvasDims(targetSize);
  el.textContent = '= ' + cw + ' \xD7 ' + ch + ' px';
}

function updatePngWarn() {
  const warn = $('pngWarn');
  if (!warn) return;
  const hasLossy = items.some(i => /jpeg|webp|avif/.test(i.file.type));
  warn.classList.toggle('hidden', !(outputFormat === 'image/png' && hasLossy));
}

function updateProcessBtn() {
  const count = items.length;
  const span = $('processCount');
  if (span) span.textContent = count ? count + '\xA0' + (count === 1 ? 'bild' : 'bilder') : '';
  $('processBtn').disabled = processing || count === 0;
}

async function processAll() {
  if (processing) return;
  processing = true;
  $('processBtn').disabled = true;
  $('postProcessBtns').classList.add('hidden');
  $('summaryText').textContent = '';

  // Reset all to pending
  items.forEach(item => {
    item.status = 'pending';
    item.blob = null;
    setStatus(item.id, 'pending', 'Väntar');
    const card = $('card-' + item.id);
    if (card) card.className = 'img-card';
  });

  const size = targetSize;
  const fmt = outputFormat;
  const q = quality;
  const ext = fmt === 'image/jpeg' ? 'jpg' : fmt === 'image/webp' ? 'webp' : 'png';
  const workerSettings = {
    size, ratio, customW, customH, fmt, quality: q,
    noUpscale: $('noUpscale').checked, bgColor, sharpness, autoCrop,
    sizeMode, targetKB, padding
  };

  const total = items.length;
  let completed = 0;
  const updateBtn = () => {
    $('processBtn').firstChild.textContent = `Optimerar ${completed}/${total}\u2026 `;
  };
  updateBtn();

  const useWorkers = typeof OffscreenCanvas !== 'undefined' && location.protocol !== 'file:';
  const concurrency = Math.min(total, navigator.hardwareConcurrency || 4, 8);
  const queue = [...items];

  const runSlot = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      if (useWorkers) {
        await processItemWorker(item, workerSettings, ext);
      } else {
        await processItem(item, size, fmt, q, ext);
      }
      completed++;
      updateBtn();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, runSlot));

  processing = false;
  const doneCount = items.filter(i => i.status === 'done').length;
  const cs = $('processCount'); if (cs) cs.textContent = '';
  const btn = $('processBtn');
  btn.firstChild.textContent = `✓ ${doneCount} bilder klara! `;
  gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.35)' });
  gsap.to(btn, { background: 'var(--good)', duration: 0.25, ease: 'power2.out' });
  setTimeout(() => {
    gsap.to(btn, { background: '', duration: 0.4, ease: 'power2.inOut',
      onComplete: () => btn.style.removeProperty('background') });
    btn.firstChild.textContent = 'Optimera igen ';
    updateProcessBtn();
  }, 2500);
  updateSummary();

  if (items.some(i => i.status === 'done')) {
    $('postProcessBtns').classList.remove('hidden');
    if (!$('zipName').value) {
      const d = new Date();
      const ds = d.getFullYear() + '' + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
      $('zipName').value = 'bilder-' + ds + '.zip';
    }
  }
}

function detectCropBounds(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const tc = document.createElement('canvas');
  tc.width = W; tc.height = H;
  const tctx = tc.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(img, 0, 0);
  const d = tctx.getImageData(0, 0, W, H).data;
  function get(x, y) { const i = (y * W + x) * 4; return [d[i], d[i+1], d[i+2]]; }
  function far(p, bg) { return Math.max(Math.abs(p[0]-bg[0]), Math.abs(p[1]-bg[1]), Math.abs(p[2]-bg[2])) > 15; }
  const corners = [get(0,0), get(W-1,0), get(0,H-1), get(W-1,H-1)];
  const bg = [0,1,2].map(c => corners.reduce((s,p) => s+p[c], 0) / 4);
  let top = 0, bot = H-1, lft = 0, rgt = W-1;
  scanT: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (far(get(x,y),bg)) { top = y; break scanT; }
  scanB: for (let y = H-1; y > top; y--) for (let x = 0; x < W; x++) if (far(get(x,y),bg)) { bot = y; break scanB; }
  scanL: for (let x = 0; x < W; x++) for (let y = top; y <= bot; y++) if (far(get(x,y),bg)) { lft = x; break scanL; }
  scanR: for (let x = W-1; x > lft; x--) for (let y = top; y <= bot; y++) if (far(get(x,y),bg)) { rgt = x; break scanR; }
  const pad = 2;
  const cx = Math.max(0, lft - pad), cy = Math.max(0, top - pad);
  return { x: cx, y: cy, w: Math.min(W - cx, rgt - lft + 1 + pad * 2), h: Math.min(H - cy, bot - top + 1 + pad * 2) };
}

function applySharpen(ctx, cw, ch, amount) {
  const src = ctx.getImageData(0, 0, cw, ch);
  const out = ctx.createImageData(cw, ch);
  const s = src.data, d = out.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const t = (Math.max(y - 1, 0) * cw + x) * 4;
      const b = (Math.min(y + 1, ch - 1) * cw + x) * 4;
      const l = (y * cw + Math.max(x - 1, 0)) * 4;
      const r = (y * cw + Math.min(x + 1, cw - 1)) * 4;
      const k = 1 + 4 * amount;
      for (let c = 0; c < 3; c++) {
        d[i + c] = Math.min(255, Math.max(0, Math.round(k * s[i + c] - amount * (s[t + c] + s[b + c] + s[l + c] + s[r + c]))));
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

function finalizeCard(item, blob, cw, ch, ext) {
  item.blob = blob;
  item.newSize = blob.size;
  item.outName = item.name.replace(/\.[^.]+$/, '') + '.' + ext;
  item.status = 'done';

  const pct = Math.round((1 - blob.size / item.originalSize) * 100);
  const card = $('card-' + item.id);
  if (card) {
    card.className = 'img-card done';
    card.style.cursor = 'pointer';
    card.onclick = e => {
      if (e.target.closest('.card-actions, .card-exif-badge, .card-crop-badge')) return;
      openPreview(item.id);
    };
    const thumbImg = card.querySelector('.card-thumb img');
    if (thumbImg) {
      const newThumbUrl = URL.createObjectURL(blob);
      if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
      item.thumbUrl = newThumbUrl;
      thumbImg.src = newThumbUrl;
    }
    card.querySelector('.card-dl')?.remove();
    const dlBtn = document.createElement('a');
    dlBtn.className = 'card-dl';
    dlBtn.href = URL.createObjectURL(blob);
    dlBtn.download = item.outName;
    dlBtn.title = 'Ladda ner';
    dlBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    dlBtn.onclick = e => e.stopPropagation();
    card.querySelector('.card-body').appendChild(dlBtn);
    const nameEl = card.querySelector('.card-name');
    if (nameEl) {
      nameEl.textContent = trimName(item.outName);
      nameEl.title = item.outName;
      nameEl.classList.add('renameable');
      nameEl.onclick = e => { e.stopPropagation(); startRename(item); };
    }
  }
  const el = $('status-' + item.id);
  if (el) {
    el.className = 'card-status done';
    el.innerHTML = cw + '\xD7' + ch + ' \xB7 ' + formatBytes(blob.size) + ' <span class="pct-pill">\u2212' + pct + '%</span>';
  }
  const cardEl = $('card-' + item.id);
  if (cardEl) gsap.fromTo(cardEl, { scale: 1.04 }, { scale: 1, duration: 0.22, ease: 'power2.out' });
  applyFilters();
}

async function processItemWorker(item, settings, ext) {
  setStatus(item.id, 'processing', 'Bearbetar\u2026');
  const card = $('card-' + item.id);
  if (card) card.className = 'img-card processing';

  try {
    const buffer = await item.file.arrayBuffer();

    const result = await new Promise((resolve, reject) => {
      const worker = new Worker('worker.js');
      worker.onmessage = e => { worker.terminate(); resolve(e.data); };
      worker.onerror = err => { worker.terminate(); reject(err); };
      worker.postMessage({
        id: item.id,
        buffer,
        mimeType: item.file.type,
        settings: { ...settings, rotation: item.rotation || 0, ignoreExifOrientation: !!item.ignoreExifOrientation, manualCrop: item.manualCrop || null }
      }, [buffer]);
    });

    if (!result.success || !result.buffer) throw new Error(result.error || 'Worker failed');

    const blob = new Blob([result.buffer], { type: settings.fmt });
    item.srcX = result.srcX; item.srcY = result.srcY;
    item.srcW = result.srcW; item.srcH = result.srcH;
    item.drawW = result.dw; item.drawH = result.dh;
    finalizeCard(item, blob, result.cw, result.ch, ext);
  } catch {
    // Worker unavailable — fall back to main-thread processing
    return processItem(item, settings.size, settings.fmt, settings.quality, ext);
  }
}

function findQuality(toBlobFn, targetBytes) {
  return (async () => {
    let blob = await toBlobFn(0.95);
    if (blob && blob.size <= targetBytes) return blob;
    let low = 0.50, high = 0.95, best = null;
    for (let i = 0; i < 8; i++) {
      const mid = (low + high) / 2;
      blob = await toBlobFn(mid);
      if (blob && blob.size <= targetBytes) { best = blob; low = mid; }
      else high = mid;
    }
    return best ?? await toBlobFn(0.50);
  })();
}

function processItem(item, size, fmt, q, ext) {
  // Note: this main-thread fallback (used when Web Workers/OffscreenCanvas are
  // unavailable) always draws via an <img> element, which browsers always
  // auto-rotate per EXIF orientation with no opt-out. The "ignorera
  // EXIF-orientering" toggle in the metadata panel therefore only has an
  // effect on the normal Web Worker path.
  return new Promise(resolve => {
    setStatus(item.id, 'processing', 'Bearbetar…');
    const card = $('card-' + item.id);
    if (card) card.className = 'img-card processing';

    const url = URL.createObjectURL(item.file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const nW = img.naturalWidth || img.width, nH = img.naturalHeight || img.height;
      let crop = null;
      if (item.manualCrop) {
        crop = {
          x: Math.round(item.manualCrop.x * nW), y: Math.round(item.manualCrop.y * nH),
          w: Math.round(item.manualCrop.w * nW), h: Math.round(item.manualCrop.h * nH)
        };
      } else if (autoCrop) {
        crop = detectCropBounds(img);
      }
      const srcX = crop ? crop.x : 0, srcY = crop ? crop.y : 0;
      const srcW = crop ? crop.w : nW;
      const srcH = crop ? crop.h : nH;

      const [cw, ch] = getCanvasDims(size, { originalW: srcW, originalH: srcH });
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');

      if (!(outputFormat === 'image/png' && bgColor === 'transparent')) {
        ctx.fillStyle = bgColor === 'transparent' ? '#ffffff' : bgColor;
        ctx.fillRect(0, 0, cw, ch);
      }

      const rot = (item.rotation || 0) % 360;
      const swap = rot === 90 || rot === 270;
      const effW = swap ? srcH : srcW, effH = swap ? srcW : srcH;
      const padPx = Math.round(Math.min(cw, ch) * padding / 100);
      const maxScale = $('noUpscale').checked ? 1 : Infinity;
      const scale = Math.min(maxScale, (cw - 2*padPx) / effW, (ch - 2*padPx) / effH);
      const dw = Math.round(effW * scale), dh = Math.round(effH * scale);
      item.srcX = srcX; item.srcY = srcY; item.srcW = srcW; item.srcH = srcH;
      item.drawW = dw; item.drawH = dh;
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(rot * Math.PI / 180);
      if (swap) {
        ctx.drawImage(img, srcX, srcY, srcW, srcH, -dh / 2, -dw / 2, dh, dw);
      } else {
        ctx.drawImage(img, srcX, srcY, srcW, srcH, -dw / 2, -dh / 2, dw, dh);
      }
      ctx.restore();

      if (sharpness > 0) applySharpen(ctx, cw, ch, sharpness / 200);

      const toBlobFn = (q) => new Promise(res => canvas.toBlob(res, fmt, q));
      const blobPromise = (sizeMode && fmt !== 'image/png')
        ? findQuality(toBlobFn, targetKB * 1024)
        : toBlobFn(q);

      blobPromise.then(blob => {
        if (!blob) { item.status = 'error'; setStatus(item.id, 'error', 'Misslyckades'); resolve(); return; }
        finalizeCard(item, blob, cw, ch, ext);
        resolve();
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      item.status = 'error';
      setStatus(item.id, 'error', 'Kunde inte l\xE4sa bilden');
      resolve();
    };

    img.src = url;
  });
}

function startRename(item) {
  const nameEl = document.querySelector('#card-' + item.id + ' .card-name');
  if (!nameEl || nameEl.querySelector('input')) return;
  const ext = item.outName.match(/\.[^.]+$/)?.[0] || '';
  const base = item.outName.slice(0, item.outName.length - ext.length);

  nameEl.textContent = '';
  const row = document.createElement('div');
  row.className = 'rename-row';

  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = base;

  const updateActive = () => {
    row.querySelectorAll('.rename-prefix').forEach(b =>
      b.classList.toggle('active', input.value[0] === b.dataset.prefix));
  };

  ['a', 'v'].forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'rename-prefix';
    btn.dataset.prefix = p;
    btn.textContent = p;
    btn.onmousedown = e => e.preventDefault(); // keep focus on input
    btn.onclick = e => {
      e.stopPropagation();
      input.value = p + input.value.replace(/^[av]/, '');
      updateActive();
      input.focus();
      input.setSelectionRange(1, input.value.length);
    };
    row.appendChild(btn);
  });

  row.appendChild(input);
  nameEl.appendChild(row);
  updateActive();
  input.focus();
  input.select();

  const save = () => {
    const newBase = input.value.trim().replace(/[<>:"/\\|?*]/g, '') || base;
    item.outName = newBase + ext;
    nameEl.textContent = trimName(item.outName);
    nameEl.title = item.outName;
    const dl = document.querySelector('#card-' + item.id + ' .card-dl');
    if (dl) dl.download = item.outName;
  };
  input.addEventListener('blur', save);
  input.addEventListener('input', updateActive);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = base; input.blur(); }
  });
  input.addEventListener('click', e => e.stopPropagation());
}

function setStatus(id, cls, text) {
  const el = $('status-' + id);
  if (!el) return;
  el.className = 'card-status ' + cls;
  el.textContent = text;
  if (cls === 'error') {
    const card = $('card-' + id);
    if (card) gsap.fromTo(card, { x: 0 }, {
      x: 7, duration: 0.06, ease: 'none', yoyo: true, repeat: 5,
      onComplete: () => gsap.set(card, { x: 0 })
    });
  }
  applyFilters();
}

function applyFilters() {
  const q = searchQuery.toLowerCase();
  $('imageGrid').querySelectorAll('.img-card').forEach(card => {
    const id = parseInt(card.id.replace('card-', ''), 10);
    const item = items.find(i => i.id === id);
    const name = (item ? (item.outName || item.name) : card.querySelector('.card-name')?.textContent || '').toLowerCase();
    const matchSearch = !q || name.includes(q);
    const isDone = card.classList.contains('done');
    const isError = card.classList.contains('error');
    const isPending = !isDone && !isError;
    const matchFilter =
      filterStatus === 'all' ||
      (filterStatus === 'done' && isDone) ||
      (filterStatus === 'error' && isError) ||
      (filterStatus === 'pending' && isPending);
    card.classList.toggle('wt-hidden', !(matchSearch && matchFilter));
  });
}

function showToast(msg, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  gsap.fromTo(toast, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
  setTimeout(() => {
    gsap.to(toast, { opacity: 0, y: -6, duration: 0.28, ease: 'power2.in',
      onComplete: () => toast.remove() });
  }, 3200);
}

function updateSummary() {
  const done = items.filter(i => i.status === 'done');
  const errors = items.filter(i => i.status === 'error');
  if (!done.length) return;
  const origTotal = done.reduce((s, i) => s + i.originalSize, 0);
  const newTotal  = done.reduce((s, i) => s + i.newSize, 0);
  const savedBytes = origTotal - newTotal;
  const savedPct  = Math.round(savedBytes / origTotal * 100);
  const countStr  = done.length + ' st' + (errors.length ? ' <span class="stat-err">(' + errors.length + ' misslyckades)</span>' : '');
  const savedSign = savedBytes >= 0;
  $('summaryText').innerHTML =
    '<div class="stat-row"><span class="stat-lbl">Bilder</span><span class="stat-val">' + countStr + '</span></div>' +
    '<div class="stat-row"><span class="stat-lbl">Originalstorlek</span><span class="stat-val">' + formatBytes(origTotal) + '</span></div>' +
    '<div class="stat-row"><span class="stat-lbl">Optimerad</span><span class="stat-val">' + formatBytes(newTotal) + '</span></div>' +
    '<div class="stat-row stat-row-save"><span class="stat-lbl">Besparing</span><span class="stat-val ' + (savedSign ? 'stat-good' : 'stat-bad') + '" id="statSaved">0 B (0%)</span></div>';

  gsap.from($('summaryText').querySelectorAll('.stat-row'), {
    opacity: 0, y: 10, duration: 0.3, ease: 'power2.out', stagger: 0.07
  });

  const counter = { bytes: 0, pct: 0 };
  gsap.to(counter, {
    bytes: Math.abs(savedBytes), pct: Math.abs(savedPct),
    duration: 1.8, ease: 'power2.out', delay: 0.3,
    snap: { pct: 1 },
    onUpdate() {
      const el = $('statSaved');
      const prefix = savedSign ? '\u2212' : '+';
      if (el) el.textContent = prefix + formatBytes(Math.round(counter.bytes)) + ' (' + Math.round(counter.pct) + '%)';
    }
  });
}

function clearAll() {
  if (!items.length) return;
  const cards = [...$('imageGrid').querySelectorAll('.img-card')];
  items = [];
  undoStack = [];
  updateUndoBtn();
  const stagger = Math.min(0.06, 0.5 / cards.length);
  const totalDuration = (cards.length - 1) * stagger + 0.25;

  gsap.to(cards, {
    opacity: 0, y: 10, scale: 0.95,
    duration: 0.25, stagger, ease: 'power2.in'
  });

  gsap.delayedCall(totalDuration, () => {
    $('imageGrid').innerHTML = '';
    $('workArea').classList.add('hidden');
    $('landing').classList.remove('hidden');
    $('postProcessBtns').classList.add('hidden');
    $('summaryText').textContent = '';
    updateProcessBtn();
  });
}

async function downloadZip() {
  const btn = $('downloadBtn');
  btn.textContent = 'Skapar ZIP…';
  btn.disabled = true;

  const doneItems = items.filter(i => i.status === 'done');
  const count = doneItems.length;
  const zip = new JSZip();
  doneItems.forEach(item => zip.file(item.outName, item.blob));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  let zipName = $('zipName').value.trim().replace(/[<>:"/\\|?*]/g, '') || 'bilder.zip';
  if (!zipName.toLowerCase().endsWith('.zip')) zipName += '.zip';
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`ZIP nedladdad — ${count} ${count === 1 ? 'fil' : 'filer'}`);

  btn.textContent = 'Ladda ner ZIP';
  btn.disabled = false;
}

async function pickFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && /\.(jpe?g|png|webp|avif)$/i.test(entry.name)) {
        files.push(await entry.getFile());
      }
    }
    if (files.length > 0) addFiles(files);
    else showToast('Inga bildfiler hittades i mappen', 'error');
  } catch (e) {
    if (e.name !== 'AbortError') console.error('pickFolder:', e);
  }
}

async function saveToFolder() {
  const done = items.filter(i => i.status === 'done' && i.blob);
  if (!done.length) return;
  const btn = $('saveFolderBtn');
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
    btn.disabled = true;
    for (const item of done) {
      const fh = await dirHandle.getFileHandle(item.outName, { create: true });
      const w = await fh.createWritable();
      await w.write(item.blob);
      await w.close();
    }
    const origHTML = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    gsap.fromTo(btn, { scale: 0.88 }, { scale: 1, duration: 0.4, ease: 'elastic.out(1.2,0.5)' });
    showToast(`${done.length} ${done.length === 1 ? 'fil sparad' : 'filer sparade'} till mapp`);
    setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2500);
  } catch (e) {
    if (e.name !== 'AbortError') console.error('saveToFolder:', e);
    btn.disabled = false;
  }
}


let lbUrl = null;
let lbOrigUrl = null;

function drawHistogram(img) {
  const hc = $('lbHistogram');
  if (!hc) return;
  const W = hc.width, H = hc.height;
  const hctx = hc.getContext('2d');
  // Sample the image at reduced size for speed
  const tc = document.createElement('canvas');
  const maxSide = 400;
  const scl = Math.min(1, maxSide / img.naturalWidth, maxSide / img.naturalHeight);
  tc.width = Math.round(img.naturalWidth * scl);
  tc.height = Math.round(img.naturalHeight * scl);
  const tctx = tc.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(img, 0, 0, tc.width, tc.height);
  const px = tctx.getImageData(0, 0, tc.width, tc.height).data;
  const bins = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let i = 0; i < px.length; i += 4) {
    bins[0][px[i]]++;
    bins[1][px[i+1]]++;
    bins[2][px[i+2]]++;
  }
  // Smooth and normalize each channel
  const norm = bins.map(b => {
    const out = new Float32Array(256);
    for (let i = 0; i < 256; i++) out[i] = (b[Math.max(0,i-1)] + b[i] + b[Math.min(255,i+1)]) / 3;
    const mx = Math.max(...out) || 1;
    return out.map(v => v / mx);
  });
  hctx.clearRect(0, 0, W, H);
  hctx.fillStyle = 'rgba(15,18,26,0.85)';
  hctx.fillRect(0, 0, W, H);
  hctx.strokeStyle = 'rgba(255,255,255,0.1)';
  hctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  const colors = ['rgba(255,90,90,0.9)', 'rgba(70,210,100,0.9)', 'rgba(80,160,255,0.9)'];
  norm.forEach((ch, ci) => {
    hctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const bx = i / 255 * W, by = H - 2 - ch[i] * (H - 4);
      i === 0 ? hctx.moveTo(bx, by) : hctx.lineTo(bx, by);
    }
    hctx.strokeStyle = colors[ci];
    hctx.lineWidth = 1.5;
    hctx.lineJoin = 'round';
    hctx.stroke();
  });
}

function setSliderPct(pct) {
  $('lbAfterWrap').style.width = (100 - pct) + '%';
  $('lbDivider').style.left = pct + '%';
}

function openPreview(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const isProcessed = !!item.blob;
  const allItems = items;
  const navItems = isProcessed ? items.filter(i => i.status === 'done') : allItems;
  const idx = navItems.findIndex(i => i.id === id);

  if (lbUrl) URL.revokeObjectURL(lbUrl);
  if (lbOrigUrl) URL.revokeObjectURL(lbOrigUrl);

  const before = $('lbBefore');
  const after = $('lbAfter');
  const divider = $('lbDivider');
  const afterWrap = $('lbAfterWrap');

  if (isProcessed) {
    lbUrl = URL.createObjectURL(item.blob);
    lbOrigUrl = URL.createObjectURL(item.file);
    divider.style.display = '';
    afterWrap.style.display = '';
    $('lbDl').style.display = '';
    document.querySelectorAll('.lb-side-label').forEach(el => el.style.display = '');

    after.onload = () => {
      const cw = after.naturalWidth, ch = after.naturalHeight;
      const maxW = window.innerWidth - 160, maxH = window.innerHeight - 140;
      const s = Math.min(1, maxW / cw, maxH / ch);
      const rw = Math.round(cw * s), rh = Math.round(ch * s);
      after.style.width = rw + 'px';
      after.style.height = rh + 'px';
      afterWrap.style.height = rh + 'px';
      drawHistogram(after);

      const tmpUrl = URL.createObjectURL(item.file);
      const origImg = new Image();
      origImg.onload = () => {
        URL.revokeObjectURL(tmpUrl);
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        const lbRot = (item.rotation || 0) % 360;
        const lbSwap = lbRot === 90 || lbRot === 270;
        const lbSW = item.srcW ?? origImg.naturalWidth, lbSH = item.srcH ?? origImg.naturalHeight;
        const lbDW = item.drawW, lbDH = item.drawH;
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(lbRot * Math.PI / 180);
        if (lbSwap) {
          ctx.drawImage(origImg, item.srcX ?? 0, item.srcY ?? 0, lbSW, lbSH, -lbDH / 2, -lbDW / 2, lbDH, lbDW);
        } else {
          ctx.drawImage(origImg, item.srcX ?? 0, item.srcY ?? 0, lbSW, lbSH, -lbDW / 2, -lbDH / 2, lbDW, lbDH);
        }
        ctx.restore();
        canvas.toBlob(blob => {
          if (lbOrigUrl) URL.revokeObjectURL(lbOrigUrl);
          lbOrigUrl = URL.createObjectURL(blob);
          before.src = lbOrigUrl;
          before.style.width = rw + 'px';
          before.style.height = rh + 'px';
          setSliderPct(50);
        }, 'image/jpeg', 0.98);
      };
      origImg.src = tmpUrl;
    };
    after.src = lbUrl;

    $('lbDl').href = lbUrl;
    $('lbDl').download = item.outName;
    const pct = Math.round((1 - item.blob.size / item.originalSize) * 100);
    $('lbMeta').innerHTML = '<strong>' + esc(item.outName) + '</strong> &nbsp;&middot;&nbsp; '
      + formatBytes(item.originalSize) + ' → ' + formatBytes(item.blob.size)
      + ' <span class="pct-pill">−' + pct + '%</span>';
  } else {
    // Original-only mode
    divider.style.display = 'none';
    afterWrap.style.display = 'none';
    $('lbDl').style.display = 'none';
    document.querySelectorAll('.lb-side-label').forEach(el => el.style.display = 'none');
    after.src = '';
    lbOrigUrl = URL.createObjectURL(item.file);
    before.onload = () => {
      const cw = before.naturalWidth, ch = before.naturalHeight;
      const maxW = window.innerWidth - 160, maxH = window.innerHeight - 140;
      const s = Math.min(1, maxW / cw, maxH / ch);
      const rw = Math.round(cw * s), rh = Math.round(ch * s);
      before.style.width = rw + 'px';
      before.style.height = rh + 'px';
      afterWrap.style.height = rh + 'px';
      drawHistogram(before);
    };
    before.src = lbOrigUrl;
    $('lbMeta').innerHTML = '<strong>' + esc(item.name) + '</strong> &nbsp;&middot;&nbsp; '
      + (item.originalW && item.originalH ? item.originalW + '×' + item.originalH + ' &nbsp;&middot;&nbsp; ' : '')
      + formatBytes(item.originalSize);
  }

  $('lbPrev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  $('lbNext').style.visibility = idx < navItems.length - 1 ? 'visible' : 'hidden';
  $('lbPrev').onclick = e => { e.stopPropagation(); openPreview(navItems[idx - 1].id); };
  $('lbNext').onclick = e => { e.stopPropagation(); openPreview(navItems[idx + 1].id); };

  // EXIF
  const exifEl = $('lbExif');
  exifEl.classList.add('hidden');
  if (typeof exifr !== 'undefined') {
    exifr.parse(item.file, ['Make', 'Model', 'FNumber', 'ExposureTime', 'ISOSpeedRatings', 'FocalLength']).then(exif => {
      if (!exif) return;
      const parts = [];
      if (exif.Make || exif.Model) parts.push([exif.Make, exif.Model].filter(Boolean).join(' '));
      if (exif.FocalLength) parts.push(Math.round(exif.FocalLength) + ' mm');
      if (exif.FNumber) parts.push('f/' + exif.FNumber);
      if (exif.ExposureTime) parts.push(exif.ExposureTime < 1 ? '1/' + Math.round(1 / exif.ExposureTime) + 's' : exif.ExposureTime + 's');
      if (exif.ISOSpeedRatings) parts.push('ISO ' + exif.ISOSpeedRatings);
      if (parts.length) { exifEl.textContent = parts.join(' · '); exifEl.classList.remove('hidden'); }
    }).catch(() => {});
  }

  $('lbOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function openRenameModal() {
  rmThumbUrls.forEach(u => URL.revokeObjectURL(u));
  rmThumbUrls = [];

  const doneItems = items.filter(i => i.status === 'done');
  if (!doneItems.length) return;

  const body = $('rmBody');
  body.innerHTML = '';

  doneItems.forEach(item => {
    const ext = item.outName.match(/\.[^.]+$/)?.[0] || '';
    const base = item.outName.slice(0, item.outName.length - ext.length);

    const thumbUrl = URL.createObjectURL(item.blob);
    rmThumbUrls.push(thumbUrl);

    const row = document.createElement('div');
    row.className = 'rm-row';

    const thumb = document.createElement('img');
    thumb.className = 'rm-thumb';
    thumb.src = thumbUrl;

    const origCol = document.createElement('span');
    origCol.className = 'rm-orig';
    origCol.textContent = item.outName;
    origCol.title = item.outName;

    const newCol = document.createElement('div');
    newCol.className = 'rm-new';

    const input = document.createElement('input');
    input.className = 'rm-input';
    input.type = 'text';
    input.value = '';
    input.dataset.itemId = item.id;
    input.dataset.ext = ext;

    const extLabel = document.createElement('span');
    extLabel.className = 'rm-ext';
    extLabel.textContent = ext;

    const updateActive = () => {
      newCol.querySelectorAll('.rename-prefix').forEach(b =>
        b.classList.toggle('active', input.value[0] === b.dataset.prefix));
    };

    ['a', 'v'].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'rename-prefix';
      btn.dataset.prefix = p;
      btn.textContent = p;
      btn.onmousedown = e => e.preventDefault();
      btn.onclick = () => {
        input.value = p + input.value.replace(/^[av]/, '');
        updateActive();
        input.focus();
        input.setSelectionRange(1, input.value.length);
      };
      newCol.appendChild(btn);
    });

    newCol.appendChild(input);
    newCol.appendChild(extLabel);
    input.addEventListener('input', updateActive);

    row.appendChild(thumb);
    row.appendChild(origCol);
    row.appendChild(newCol);
    body.appendChild(row);
  });

  $('rmArtnr').value = '';
  $('rmPrefixA').classList.add('active');
  $('rmPrefixV').classList.remove('active');
  $('rmArtnrPreview').textContent = 'a12345[1].jpg, a12345[2].jpg …';

  $('rmOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('rmArtnr').focus();
}

function closeRenameModal() {
  $('rmOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  $('rmBody').innerHTML = '';
  rmThumbUrls.forEach(u => URL.revokeObjectURL(u));
  rmThumbUrls = [];
}

function saveRenameModal() {
  $('rmBody').querySelectorAll('.rm-input').forEach(input => {
    const newBase = input.value.trim().replace(/[<>:"/\\|?*]/g, '');
    if (!newBase) return; // empty = keep original
    const item = items.find(i => i.id === +input.dataset.itemId);
    if (!item) return;
    item.outName = newBase + input.dataset.ext;
    const nameEl = document.querySelector('#card-' + item.id + ' .card-name');
    if (nameEl && !nameEl.querySelector('input')) {
      nameEl.textContent = trimName(item.outName);
      nameEl.title = item.outName;
    }
    const dl = document.querySelector('#card-' + item.id + ' .card-dl');
    if (dl) dl.download = item.outName;
  });
  closeRenameModal();
}

function closePreview() {
  $('lbOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  if (lbUrl) { URL.revokeObjectURL(lbUrl); lbUrl = null; }
  if (lbOrigUrl) { URL.revokeObjectURL(lbOrigUrl); lbOrigUrl = null; }
  $('lbBefore').src = '';
  $('lbAfter').src = '';
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function trimName(name) {
  return name.length > 28 ? name.slice(0, 25) + '…' : name;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

init();
