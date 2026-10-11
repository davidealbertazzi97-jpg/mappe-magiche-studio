(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'mappe-magiche-studio-v1';
  const TYPES = new Set(['circle', 'rect', 'diamond', 'cloud', 'text', 'note', 'image', 'mascot']);
  const COLORS = ['#fff0a8', '#c9f3df', '#cfe7ff', '#f8d4e7', '#e4d8ff', '#ffd9bd', '#ffffff'];
  const DEFAULT_FONT = 'Nunito Sans';
  const FONT_FAMILIES = new Set([
    'Nunito Sans', 'Inter', 'Open Sans', 'Lato', 'Source Sans 3', 'Noto Sans', 'Fira Sans',
    'IBM Plex Sans', 'Roboto', 'Ubuntu Sans', 'Atkinson Hyperlegible Next', 'Lexend',
    'OpenDyslexic', 'Merriweather', 'Source Serif 4', 'JetBrains Mono',
  ]);
  const MASCOTS = [
    { emoji: '🦊', name: 'Maia la Volpe' },
    { emoji: '🦉', name: 'Olmo il Gufo' },
    { emoji: '🐻', name: 'Bruno l’Orso' },
    { emoji: '🐸', name: 'Lina la Rana' },
    { emoji: '🐱', name: 'Milo il Gatto' },
    { emoji: '🐼', name: 'Panda Pino' },
  ];
  const SIZE = {
    circle: [156, 126], rect: [176, 112], diamond: [184, 142], cloud: [190, 142],
    text: [220, 92], note: [204, 138], image: [196, 164], mascot: [236, 184],
  };
  const SIDE = {
    top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0],
  };
  const $ = (id) => document.getElementById(id);
  const board = $('board');
  const viewport = $('viewport');
  const linksLayer = $('links-layer');
  const nodesLayer = $('nodes-layer');
  const linkHandlesLayer = $('link-handles-layer');
  const tempLink = $('temp-link');
  const modalText = $('modal-text');
  const modalImage = $('modal-image');
  const modalMascot = $('modal-mascot');
  const modalSize = $('modal-size');

  const state = {
    nodes: [], links: [], selectedId: null, selectedLinkId: null, fontFamily: DEFAULT_FONT,
    x: 0, y: 0, scale: 1, width: 1, height: 1,
    drag: null, pan: null, resize: null, linkDraft: null, linkEndDrag: null, editorId: null,
    imageSelection: null, paletteColor: COLORS[0], saveTimer: null,
    contextNodeId: null, contextLinkId: null,
  };

  function makeId(prefix) {
    const random = Math.random().toString(36).slice(2, 9);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function svg(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  }

  function safeImageUrl(value) {
    if (typeof value !== 'string') return '';
    const url = value.trim();
    if (/^https?:\/\//i.test(url) || /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
    return '';
  }

  function confirmRemoteImages(nodes) {
    const remoteNodes = nodes.filter((node) => /^https?:\/\//i.test(node.imageUrl));
    if (!remoteNodes.length) return 0;

    const hosts = [...new Set(remoteNodes.map((node) => {
      try { return new URL(node.imageUrl).host; } catch (_) { return ''; }
    }).filter(Boolean))];
    const hostList = hosts.slice(0, 5).join(', ');
    const moreHosts = hosts.length > 5 ? ` e altri ${hosts.length - 5}` : '';
    const message = [
      `Questa mappa contiene ${remoteNodes.length} ${remoteNodes.length === 1 ? 'immagine esterna' : 'immagini esterne'}.`,
      hosts.length ? `Siti coinvolti: ${hostList}${moreHosts}.` : '',
      'Se le carichi, questi siti possono vedere il tuo indirizzo di rete e quando apri la mappa. Il contenuto della mappa non viene inviato.',
      'Vuoi caricare le immagini esterne? Se scegli No, gli indirizzi esterni verranno rimossi dalla mappa.',
    ].filter(Boolean).join('\n\n');

    if (window.confirm(message)) return 0;
    remoteNodes.forEach((node) => { node.imageUrl = ''; });
    return remoteNodes.length;
  }

  let textMeasureContext;
  function textWidth(value, fontSize, fontFamily, bold = false, italic = false) {
    try {
      textMeasureContext ||= document.createElement('canvas').getContext('2d');
      textMeasureContext.font = `${italic ? 'italic ' : ''}${bold ? '800 ' : '650 '}${fontSize}px "${fontFamily}", sans-serif`;
      return textMeasureContext.measureText(value).width;
    } catch (_) { return String(value).length * fontSize * .57; }
  }

  function wrapToWidth(value, maxWidth, fontSize, fontFamily, bold = false, italic = false) {
    const lines = [];
    const paragraphs = String(value || '').split(/\r?\n/);
    const fits = (text) => textWidth(text, fontSize, fontFamily, bold, italic) <= maxWidth;
    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const originalWord of words) {
        let word = originalWord;
        if (!fits(word)) {
          if (line) { lines.push(line); line = ''; }
          let piece = '';
          for (const char of Array.from(word)) {
            if (piece && !fits(piece + char)) { lines.push(piece); piece = char; }
            else piece += char;
          }
          word = piece;
          if (word) { line = word; }
          continue;
        }
        const candidate = line ? `${line} ${word}` : word;
        if (line && !fits(candidate)) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  function fitTextLayout(value, maxWidth, maxHeight, preferredFont, fontFamily, options = {}) {
    const lineRatio = options.lineRatio || 1.22;
    const floor = options.minFont || 3;
    const makeLayout = (fontSize) => {
      const lines = wrapToWidth(value, maxWidth, fontSize, fontFamily, options.bold, options.italic);
      const lineHeight = Math.max(1, Math.round(fontSize * lineRatio));
      return { lines, fontSize, lineHeight, height: lines.length * lineHeight };
    };
    const top = Math.max(floor, preferredFont);
    const first = makeLayout(top);
    if (first.height <= maxHeight) return first;
    let low = 0, high = Math.floor((top - floor) * 2), best = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const layout = makeLayout(top - middle * .5);
      if (layout.height <= maxHeight) { best = layout; high = middle - 1; }
      else low = middle + 1;
    }
    return best || makeLayout(floor);
  }

  function addWrappedText(parent, value, x, centerY, layout, options = {}) {
    const fontSize = layout.fontSize || options.fontSize || 18;
    const lineHeight = layout.lineHeight || options.lineHeight || Math.round(fontSize * 1.25);
    const lines = layout.lines || [''];
    const attrs = {
      class: options.className || 'node-label',
      x, y: centerY - ((lines.length - 1) * lineHeight) / 2,
      'text-anchor': options.anchor || 'middle', 'dominant-baseline': 'middle',
      'font-size': fontSize,
      'text-decoration': options.underline ? 'underline' : 'none',
    };
    if (options.fill) attrs.fill = options.fill;
    const text = svg('text', attrs);
    lines.forEach((line, index) => {
      const span = svg('tspan', { x, dy: index === 0 ? 0 : lineHeight });
      span.textContent = line;
      text.appendChild(span);
    });
    parent.appendChild(text);
    return text;
  }

  function addTextSurface(parent, x, centerY, maxWidth, maxHeight, layout, fontFamily, className = 'text-surface', align = 'center', bold = false, italic = false) {
    const lines = layout.lines || [''];
    const fontSize = layout.fontSize || 18;
    const lineHeight = layout.lineHeight || Math.round(fontSize * 1.25);
    const lineWidth = Math.max(0, ...lines.map((line) => textWidth(line, fontSize, fontFamily, bold, italic)));
    const width = Math.min(maxWidth, Math.max(48, lineWidth + 22));
    const height = Math.min(maxHeight, Math.max(32, lines.length * lineHeight + 12));
    const left = align === 'left' ? x - maxWidth / 2 + 4 : align === 'right' ? x + maxWidth / 2 - width - 4 : x - width / 2;
    parent.appendChild(svg('rect', {
      class: className, x: left, y: centerY - height / 2,
      width, height, rx: Math.min(14, height / 2), 'pointer-events': 'none',
    }));
  }

  function clampDimension(value, min, max, fallback) {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
  }

  function chosenTextSize(node, automaticSize) {
    return Number.isFinite(Number(node.fontSize)) && Number(node.fontSize) >= 8
      ? Math.round(Math.max(8, Math.min(48, Number(node.fontSize))) * 4 / 3)
      : automaticSize;
  }

  function autoTextSize(node, baseFontSize) {
    const [baseW, baseH] = SIZE[node.type] || SIZE.rect;
    const [w, h] = nodeSize(node);
    const scale = Math.sqrt((w / baseW) * (h / baseH));
    return clampDimension(baseFontSize * scale, 12, 64, baseFontSize);
  }

  function textPlacement(width, align, inset = 14) {
    if (align === 'left') return { x: inset, anchor: 'start' };
    if (align === 'right') return { x: width - inset, anchor: 'end' };
    return { x: width / 2, anchor: 'middle' };
  }

  function nodeSize(node) {
    const [baseW, baseH] = SIZE[node.type] || SIZE.rect;
    return [clampDimension(node.w, 90, 800, baseW), clampDimension(node.h, 70, 600, baseH)];
  }

  function resizeNode(node, nextW, nextH, referenceW, referenceH, referenceFontSize = node.fontSize) {
    const width = clampDimension(nextW, 90, 800, referenceW);
    const height = clampDimension(nextH, 70, 600, referenceH);
    node.w = width;
    node.h = height;
    if (referenceFontSize != null && referenceFontSize !== '' && Number.isFinite(Number(referenceFontSize))) {
      const scale = Math.sqrt((width / referenceW) * (height / referenceH));
      node.fontSize = clampDimension(Number(referenceFontSize) * scale, 8, 48, Number(referenceFontSize));
    }
  }

  function growNodeForText(node, targetFontPx, currentFontPx) {
    if (!Number.isFinite(targetFontPx) || !Number.isFinite(currentFontPx) || currentFontPx <= 0) return;
    const scale = Math.max(1, targetFontPx / currentFontPx);
    if (scale <= 1) return;
    const [oldW, oldH] = nodeSize(node);
    const nextW = clampDimension(oldW * scale, 90, 800, oldW);
    const nextH = clampDimension(oldH * scale, 70, 600, oldH);
    node.x += (oldW - nextW) / 2;
    node.y += (oldH - nextH) / 2;
    resizeNode(node, nextW, nextH, oldW, oldH, node.fontSize);
  }

  function fitNodeGeometry(node) {
    const [w, startingHeight] = nodeSize(node);
    const family = FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily;
    const [baseW, baseH] = SIZE[node.type] || SIZE.rect;
    const baseFont = node.type === 'image' ? 13 : node.type === 'mascot' ? 14 : node.type === 'text' ? 18 : 19;
    const text = node.text || (node.type === 'mascot' ? 'Ciao! Quale concetto scopriamo?' : node.type === 'text' ? 'Scrivi un concetto' : 'Nuovo concetto');
    let height = startingHeight;
    for (let pass = 0; pass < 6; pass += 1) {
      node.h = height;
      const font = chosenTextSize(node, autoTextSize(node, baseFont));
      let requiredHeight = baseH;
      if (node.type === 'image' && node.text) {
        const lines = wrapToWidth(node.text, Math.max(20, w - 36), font, family, node.bold, node.italic);
        const captionHeight = lines.length * Math.round(font * 1.08) + 12;
        requiredHeight = 20 + 64 + captionHeight;
      } else if (node.type === 'mascot') {
        const lines = wrapToWidth(text, Math.max(20, w - 40), font, family, node.bold, node.italic);
        const mascotScale = Math.sqrt((w / SIZE.mascot[0]) * (height / SIZE.mascot[1]));
        const emojiSize = clampDimension(50 * mascotScale, 36, 96, 50);
        requiredHeight = lines.length * Math.round(font * 1.2) + Math.max(50, emojiSize) + 36;
      } else if (node.type !== 'image') {
        const widthFactor = { circle: .70, diamond: .60, cloud: .70, note: .78, text: .84 }[node.type] || .84;
        const heightFactor = { circle: .62, diamond: .60, cloud: .54, note: .70, text: .76 }[node.type] || .72;
        const maxWidth = Math.max(20, w * widthFactor - 24);
        const lines = wrapToWidth(text, maxWidth, font, family, node.bold, node.italic);
        const neededTextHeight = lines.length * Math.round(font * 1.22) + 12;
        requiredHeight = neededTextHeight / heightFactor;
      }
      const floorHeight = node.autoFit === true ? baseH : startingHeight;
      const nextHeight = clampDimension(Math.max(floorHeight, requiredHeight), 70, 600, height);
      if (Math.abs(nextHeight - height) < 1) { height = nextHeight; break; }
      height = nextHeight;
    }
    node.y += (startingHeight - height) / 2;
    node.h = height;
  }

  function ensureNodeCanContainText(node) {
    let [w, h] = nodeSize(node);
    const family = FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily;
    const text = node.text || (node.type === 'mascot' ? 'Ciao! Quale concetto scopriamo?' : node.type === 'text' ? 'Scrivi un concetto' : 'Nuovo concetto');
    const minimumLayout = (value, width, ratio, bold = node.bold, italic = node.italic) => fitTextLayout(value, width, Infinity, 3, family, { minFont: 3, lineRatio: ratio, bold, italic });
    const neededHeight = (boxWidth, boxHeight) => {
      if (node.type === 'image') {
        if (!node.text) return boxHeight;
        const caption = minimumLayout(node.text, Math.max(20, boxWidth - 36), 1.08);
        return 20 + 64 + caption.height + 12;
      }
      if (node.type === 'mascot') {
        const lines = minimumLayout(text, Math.max(20, boxWidth - 40), 1.2);
        const scale = Math.sqrt((boxWidth / SIZE.mascot[0]) * (boxHeight / SIZE.mascot[1]));
        const emoji = clampDimension(50 * scale, 36, 96, 50);
        return lines.height + Math.max(50, emoji) + 36;
      }
      const widthFactor = { circle: .70, diamond: .60, cloud: .70, note: .78, text: .84 }[node.type] || .84;
      const heightFactor = { circle: .62, diamond: .60, cloud: .54, note: .70, text: .76 }[node.type] || .72;
      const layout = minimumLayout(text, Math.max(20, boxWidth * widthFactor - 24), 1.22);
      return (layout.height + 12) / heightFactor;
    };
    let required = neededHeight(w, h);
    if (required > 600 && w < 800) {
      let low = w, high = 800, best = 800;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (neededHeight(middle, h) <= 600) { best = middle; high = middle - 1; }
        else low = middle + 1;
      }
      const nextWidth = clampDimension(best, 90, 800, w);
      if (nextWidth > w) { node.x -= (nextWidth - w) / 2; node.w = nextWidth; w = nextWidth; }
      required = neededHeight(w, h);
    }
    const nextHeight = clampDimension(Math.max(h, required), 70, 600, h);
    if (nextHeight > h) node.y -= (nextHeight - h) / 2;
    node.h = nextHeight;
  }

  function portPoint(node, side) {
    const [w, h] = nodeSize(node);
    if (side === 'top') return { x: node.x + w / 2, y: node.y };
    if (side === 'right') return { x: node.x + w, y: node.y + h / 2 };
    if (side === 'bottom') return { x: node.x + w / 2, y: node.y + h };
    return { x: node.x, y: node.y + h / 2 };
  }

  function linkPath(fromNode, fromSide, toNode, toSide, freeEnd, freeStart) {
    const start = fromNode ? portPoint(fromNode, fromSide) : freeStart;
    const end = toNode ? portPoint(toNode, toSide) : freeEnd;
    const length = Math.max(42, Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) * 0.38));
    const a = fromNode ? SIDE[fromSide] : [0, 0];
    const b = toNode ? SIDE[toSide] : [0, 0];
    return `M ${start.x} ${start.y} C ${start.x + a[0] * length} ${start.y + a[1] * length}, ${end.x + b[0] * length} ${end.y + b[1] * length}, ${end.x} ${end.y}`;
  }

  function detachLinkEndpoint(link, role) {
    if (role === 'from' && link.from) {
      const node = state.nodes.find((item) => item.id === link.from);
      if (!node) return false;
      link.freeStart = portPoint(node, link.fromSide);
      link.from = null;
      link.fromSide = null;
      return true;
    }
    if (role === 'to' && link.to) {
      const node = state.nodes.find((item) => item.id === link.to);
      if (!node) return false;
      link.freeEnd = portPoint(node, link.toSide);
      link.to = null;
      link.toSide = null;
      return true;
    }
    return false;
  }

  function addPorts(group, node) {
    const [w, h] = nodeSize(node);
    const points = {
      top: [w / 2, 0], right: [w, h / 2], bottom: [w / 2, h], left: [0, h / 2],
    };
    for (const [side, [cx, cy]] of Object.entries(points)) {
      const port = svg('circle', { class: 'port', cx, cy, r: 9, 'data-node-id': node.id, 'data-side': side, tabindex: 0, role: 'button', 'aria-label': `Punto di collegamento ${side}` });
      port.appendChild(svg('title')).textContent = `Trascina per collegare (${side})`;
      group.appendChild(port);
    }
  }

  function drawNode(node) {
    const [w, h] = nodeSize(node);
    const fontFamily = FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily;
    const group = svg('g', { class: `node${node.id === state.selectedId ? ' selected' : ''}`, transform: `translate(${node.x} ${node.y})`, 'data-node-id': node.id, 'font-family': fontFamily, 'font-weight': node.bold ? 800 : 650, 'font-style': node.italic ? 'italic' : 'normal', fill: node.textColor || '#17243d', tabindex: 0, role: 'group', 'aria-label': `${node.type}: ${node.text || node.name || ''}` });
    if (node.sourceTitle || node.license) {
      const credit = svg('title');
      credit.textContent = [node.sourceTitle, node.license].filter(Boolean).join(' — ');
      group.appendChild(credit);
    }
    const fill = node.color || COLORS[0];
    let body;

    if (node.type === 'circle') {
      body = svg('ellipse', { class: 'body', cx: w / 2, cy: h / 2, rx: w / 2 - 4, ry: h / 2 - 4, fill });
    } else if (node.type === 'diamond') {
      body = svg('polygon', { class: 'body', points: `${w / 2},4 ${w - 4},${h / 2} ${w / 2},${h - 4} 4,${h / 2}`, fill });
    } else if (node.type === 'cloud') {
      body = svg('path', { class: 'body', d: `M ${w * .20} ${h * .87} C ${w * .05} ${h * .87}, ${w * .04} ${h * .68}, ${w * .11} ${h * .57} C ${w * .08} ${h * .27}, ${w * .21} ${h * .17}, ${w * .30} ${h * .29} C ${w * .37} ${h * .04}, ${w * .59} ${h * .06}, ${w * .63} ${h * .27} C ${w * .76} ${h * .12}, ${w * .93} ${h * .27}, ${w * .90} ${h * .53} C ${w * 1.04} ${h * .58}, ${w * 1.02} ${h * .84}, ${w * .79} ${h * .84} Z`, fill });
    } else if (node.type === 'text') {
      body = svg('rect', { class: 'body text-body', x: 4, y: 4, width: w - 8, height: h - 8, rx: 14, fill, 'fill-opacity': '.36' });
    } else if (node.type === 'note') {
      body = svg('path', { class: 'body', d: `M 7 4 H ${w - 32} L ${w - 5} 31 V ${h - 10} Q ${w - 5} ${h - 4} ${w - 13} ${h - 4} H 9 Q 3 ${h - 4} 3 ${h - 12} V 12 Q 3 4 7 4 Z`, fill });
    } else {
      body = svg('rect', { class: 'body', x: 4, y: 4, width: w - 8, height: h - 8, rx: node.type === 'mascot' ? 22 : 18, fill });
    }
    group.appendChild(body);

    if (node.type === 'image') {
      const captionFont = chosenTextSize(node, autoTextSize(node, 13));
      const captionLayout = node.text ? fitTextLayout(node.text, w - 36, Math.max(20, h * .62), captionFont, fontFamily, { lineRatio: 1.08, bold: node.bold, italic: node.italic }) : null;
      const captionBand = captionLayout ? Math.min(Math.max(32, captionLayout.height + 12), Math.max(32, h - 30)) : 0;
      const imageHeight = Math.max(12, h - 20 - captionBand);
      if (node.imageUrl) {
        const clipId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const defs = svg('defs');
        const clip = svg('clipPath', { id: clipId });
        clip.appendChild(svg('rect', { x: 10, y: 10, width: w - 20, height: imageHeight, rx: 12 }));
        defs.appendChild(clip);
        group.appendChild(defs);
        const image = svg('image', { x: 10, y: 10, width: w - 20, height: imageHeight, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` });
        image.setAttribute('href', node.imageUrl);
        group.appendChild(image);
        group.appendChild(svg('rect', { x: 10, y: 10, width: w - 20, height: imageHeight, rx: 12, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'pointer-events': 'none' }));
      } else {
        group.appendChild(svg('text', { x: w / 2, y: h / 2 - 6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 34 }).appendChild(document.createTextNode('🖼️')).parentNode);
        const hint = fitTextLayout('Doppio clic per scegliere', w - 24, 20, 12, fontFamily, { lineRatio: 1.1 });
        addWrappedText(group, 'Doppio clic per scegliere', w / 2, h - 25, hint, { fill: '#596080' });
      }
      if (node.text) {
        const placement = textPlacement(w, node.textAlign, 18);
        const captionY = h - 10 - captionBand / 2;
        addTextSurface(group, w / 2, captionY, w - 18, captionBand, captionLayout, fontFamily, 'image-caption-surface', node.textAlign, node.bold, node.italic);
        addWrappedText(group, node.text, placement.x, captionY, captionLayout, { className: 'image-caption', anchor: placement.anchor, underline: node.underline });
      }
    } else if (node.type === 'mascot') {
      const mascotFont = chosenTextSize(node, autoTextSize(node, 14));
      const mascotText = node.text || 'Ciao! Quale concetto scopriamo?';
      const nameFont = chosenTextSize(node, autoTextSize(node, 14));
      const nameplateHeight = Math.min(46, Math.max(25, nameFont * 1.55 + 8));
      const mascotScale = Math.sqrt((w / SIZE.mascot[0]) * (h / SIZE.mascot[1]));
      const emojiSize = clampDimension(50 * mascotScale, 36, 96, 50);
      const mascotLayout = fitTextLayout(mascotText, w - 40, Math.max(12, h - Math.max(emojiSize, nameplateHeight) - 36), mascotFont, fontFamily, { lineRatio: 1.2, bold: node.bold, italic: node.italic });
      const bubbleH = Math.min(h - Math.max(emojiSize, nameplateHeight) - 18, Math.max(64, mascotLayout.height + 18));
      group.appendChild(svg('rect', { class: 'mascot-bubble', x: 8, y: 4, width: w - 16, height: bubbleH, rx: 18 }));
      const mascotPlacement = textPlacement(w, node.textAlign, 20);
      addWrappedText(group, mascotText, mascotPlacement.x, bubbleH / 2 + 5, mascotLayout, { anchor: mascotPlacement.anchor, underline: node.underline });
      const nameplateY = h - 8 - nameplateHeight;
      const emojiY = Math.max(bubbleH + emojiSize / 2 + 6, nameplateY - emojiSize / 2 - 7);
      group.appendChild(svg('text', { class: 'mascot-emoji', x: w / 2, y: emojiY, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': emojiSize }).appendChild(document.createTextNode(node.emoji || '🦊')).parentNode);
      group.appendChild(svg('rect', { class: 'mascot-nameplate', x: 18, y: nameplateY, width: w - 36, height: nameplateHeight, rx: nameplateHeight / 2, 'pointer-events': 'none' }));
      const mascotName = node.name || 'Mascotte';
      const nameLayout = fitTextLayout(mascotName, w - 48, nameplateHeight - 4, nameFont, fontFamily, { lineRatio: 1.1, bold: true });
      addWrappedText(group, mascotName, w / 2, nameplateY + nameplateHeight / 2, nameLayout, { className: 'mascot-name' });
    } else {
      const text = node.text || (node.type === 'text' ? 'Scrivi un concetto' : 'Nuovo concetto');
      const autoFont = autoTextSize(node, node.type === 'text' ? 18 : 19);
      const font = chosenTextSize(node, autoFont);
      const surfaceWidthFactor = { circle: .70, diamond: .60, cloud: .70, note: .78, text: .84 }[node.type] || .84;
      const surfaceHeightFactor = { circle: .62, diamond: .60, cloud: .54, note: .70, text: .76 }[node.type] || .72;
      const surfaceMaxHeight = h * surfaceHeightFactor;
      const surfaceWidth = w * surfaceWidthFactor;
      const layout = fitTextLayout(text, surfaceWidth - 24, surfaceMaxHeight - 12, font, fontFamily, { lineRatio: 1.22, bold: node.bold, italic: node.italic });
      const surfaceLeft = (w - surfaceWidth) / 2;
      const placement = node.textAlign === 'left'
        ? { x: surfaceLeft + 12, anchor: 'start' }
        : node.textAlign === 'right'
          ? { x: w - surfaceLeft - 12, anchor: 'end' }
          : { x: w / 2, anchor: 'middle' };
      addTextSurface(group, w / 2, h / 2, surfaceWidth, surfaceMaxHeight, layout, fontFamily, 'text-surface', node.textAlign, node.bold, node.italic);
      addWrappedText(group, text, placement.x, h / 2, layout, { className: 'node-label', anchor: placement.anchor, underline: node.underline });
      if (node.type === 'note' && node.text) {
        // A small folded corner makes notes recognizable at a glance.
        group.appendChild(svg('path', { d: `M ${w - 32} 4 V 31 H ${w - 5}`, fill: '#fff8d7', stroke: '#454b7a', 'stroke-width': 2, 'pointer-events': 'none' }));
      }
    }

    addPorts(group, node);
    if (node.id === state.selectedId) {
      const resizeHandle = svg('rect', {
        class: 'resize-handle', x: w - 9, y: h - 9, width: 18, height: 18,
        rx: 4, 'data-node-id': node.id, 'aria-label': 'Ridimensiona forma',
      });
      resizeHandle.appendChild(svg('title')).textContent = 'Trascina per cambiare dimensione';
      group.appendChild(resizeHandle);
    }
    return group;
  }

  function render() {
    state.nodes.forEach(ensureNodeCanContainText);
    viewport.setAttribute('transform', `translate(${state.x} ${state.y}) scale(${state.scale})`);
    linksLayer.replaceChildren();
    nodesLayer.replaceChildren();
    linkHandlesLayer.replaceChildren();
    for (const link of state.links) {
      const a = state.nodes.find((item) => item.id === link.from);
      const b = state.nodes.find((item) => item.id === link.to);
      const start = a ? portPoint(a, link.fromSide) : link.freeStart;
      const end = b ? portPoint(b, link.toSide) : link.freeEnd;
      if (!start || !end) continue;
      const selected = link.id === state.selectedLinkId;
      const direction = ['forward', 'both', 'reverse'].includes(link.direction) ? link.direction : 'forward';
      const path = svg('path', { class: `link direction-${direction}${selected ? ' selected' : ''}${a && b ? '' : ' dangling'}`, d: linkPath(a, link.fromSide, b, link.toSide, end, start), 'data-link-id': link.id, 'stroke-width': selected ? 5 : 3.5, tabindex: 0, role: 'button', 'aria-label': link.label ? `Collegamento: ${link.label}` : a && b ? 'Collegamento tra concetti' : 'Collegamento sospeso, trascina una punta per agganciarla' });
      linksLayer.appendChild(path);
      const endpoints = [
        { role: a ? 'from' : 'free-from', point: start, connected: Boolean(a) },
        { role: b ? 'to' : 'free-to', point: end, connected: Boolean(b) },
      ];
      for (const endpointData of endpoints) {
        if (endpointData.connected && !selected) continue;
        const endpoint = svg('circle', { class: `link-endpoint${endpointData.connected ? ' connected-endpoint' : ''}${selected ? ' selected' : ''}`, cx: endpointData.point.x, cy: endpointData.point.y, r: endpointData.connected ? 7 : 8, 'data-link-end-id': link.id, 'data-link-end-role': endpointData.role, tabindex: 0, role: 'button', 'aria-label': endpointData.connected ? 'Estremità collegata: doppio clic per scollegarla' : 'Estremità libera: trascina su una forma per agganciarla' });
        endpoint.appendChild(svg('title')).textContent = endpointData.connected ? 'Doppio clic per staccare questa punta' : 'Trascina questo punto su una forma per agganciare il collegamento';
        linkHandlesLayer.appendChild(endpoint);
      }
      if (link.label) {
        const label = svg('text', { class: 'link-label', x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8, 'text-anchor': 'middle', 'font-family': state.fontFamily, 'data-link-id': link.id });
        label.textContent = link.label;
        linksLayer.appendChild(label);
      }
    }
    for (const node of state.nodes) nodesLayer.appendChild(drawNode(node));
    $('zoom-val').textContent = `${Math.round(state.scale * 100)}%`;
    tempLink.style.display = state.linkDraft ? '' : 'none';
    updateSelectionTools();
    scheduleSave();
  }

  function normalizeData(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) throw new Error('Il file non contiene una mappa valida.');
    if (data.nodes.length > 1000 || data.links.length > 3000) throw new Error('La mappa supera il limite di elementi consentito.');
    const nodes = [];
    const seen = new Set();
    for (const raw of data.nodes) {
      if (!raw || !TYPES.has(raw.type)) continue;
      const id = typeof raw.id === 'string' && raw.id.length < 100 && !seen.has(raw.id) ? raw.id : makeId('node');
      seen.add(id);
      const [baseW, baseH] = SIZE[raw.type];
      const mapFont = FONT_FAMILIES.has(data.fontFamily) ? data.fontFamily : DEFAULT_FONT;
      const candidate = {
        id, type: raw.type,
        x: Number.isFinite(Number(raw.x)) ? Math.max(-100000, Math.min(100000, Number(raw.x))) : 0,
        y: Number.isFinite(Number(raw.y)) ? Math.max(-100000, Math.min(100000, Number(raw.y))) : 0,
        w: clampDimension(raw.w, 90, 800, baseW), h: clampDimension(raw.h, 70, 600, baseH), text: String(raw.text || '').slice(0, 5000),
        autoFit: raw.autoFit === true,
        fontFamily: FONT_FAMILIES.has(raw.fontFamily) ? raw.fontFamily : mapFont,
        fontSize: Number.isFinite(Number(raw.fontSize)) && Number(raw.fontSize) >= 8 && Number(raw.fontSize) <= 48 ? Math.round(Number(raw.fontSize)) : null,
        bold: raw.bold === true,
        italic: raw.italic === true,
        underline: raw.underline === true,
        textColor: typeof raw.textColor === 'string' && /^#[\da-f]{6}$/i.test(raw.textColor) ? raw.textColor : '#17243d',
        textAlign: ['left', 'center', 'right'].includes(raw.textAlign) ? raw.textAlign : 'center',
        color: COLORS.includes(raw.color) ? raw.color : COLORS[0],
        imageUrl: safeImageUrl(raw.imageUrl), sourceTitle: String(raw.sourceTitle || '').slice(0, 500),
        license: String(raw.license || '').slice(0, 300),
        emoji: MASCOTS.some((m) => m.emoji === raw.emoji) ? raw.emoji : '🦊',
        name: MASCOTS.some((m) => m.emoji === raw.emoji) ? MASCOTS.find((m) => m.emoji === raw.emoji).name : String(raw.name || 'Maia la Volpe').slice(0, 80),
      };
      fitNodeGeometry(candidate);
      nodes.push(candidate);
    }
    const nodeIds = new Set(nodes.map((item) => item.id));
    const links = [];
    for (const raw of data.links) {
      if (!raw) continue;
      const id = typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : makeId('link');
      const hasFrom = nodeIds.has(raw.from) && Boolean(SIDE[raw.fromSide]);
      const hasTo = nodeIds.has(raw.to) && Boolean(SIDE[raw.toSide]);
      const freeStartX = Number(raw.freeStart?.x), freeStartY = Number(raw.freeStart?.y);
      const freeEndX = Number(raw.freeEnd?.x), freeEndY = Number(raw.freeEnd?.y);
      const freeStart = !hasFrom && Number.isFinite(freeStartX) && Number.isFinite(freeStartY)
        ? { x: Math.max(-100000, Math.min(100000, freeStartX)), y: Math.max(-100000, Math.min(100000, freeStartY)) } : null;
      const freeEnd = !hasTo && Number.isFinite(freeEndX) && Number.isFinite(freeEndY)
        ? { x: Math.max(-100000, Math.min(100000, freeEndX)), y: Math.max(-100000, Math.min(100000, freeEndY)) } : null;
      if ((!hasFrom && !freeStart) || (!hasTo && !freeEnd) || (hasFrom && hasTo && raw.from === raw.to)) continue;
      links.push({
        id, from: hasFrom ? raw.from : null, fromSide: hasFrom ? raw.fromSide : null,
        to: hasTo ? raw.to : null, toSide: hasTo ? raw.toSide : null,
        ...(freeStart ? { freeStart } : {}), ...(freeEnd ? { freeEnd } : {}),
        direction: ['forward', 'both', 'reverse'].includes(raw.direction) ? raw.direction : 'forward',
        label: String(raw.label || '').slice(0, 180),
      });
    }
    return { nodes, links, fontFamily: FONT_FAMILIES.has(data.fontFamily) ? data.fontFamily : DEFAULT_FONT, x: Number.isFinite(Number(data.x)) ? Number(data.x) : 0, y: Number.isFinite(Number(data.y)) ? Number(data.y) : 0, scale: Number.isFinite(Number(data.scale)) ? Math.max(.25, Math.min(2.5, Number(data.scale))) : 1 };
  }

  function snapshot() {
    return { version: 1, fontFamily: state.fontFamily, nodes: state.nodes, links: state.links, x: state.x, y: state.y, scale: state.scale };
  }

  function mapBounds() {
    const points = [];
    for (const node of state.nodes) {
      const [w, h] = nodeSize(node);
      points.push({ x: node.x, y: node.y }, { x: node.x + w, y: node.y + h });
    }
    for (const link of state.links) {
      if (link.freeStart) points.push(link.freeStart);
      if (link.freeEnd) points.push(link.freeEnd);
    }
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)),
      maxX: Math.max(...points.map((point) => point.x)), maxY: Math.max(...points.map((point) => point.y)),
    };
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
        $('btn-save').setAttribute('aria-label', 'Mappa salvata automaticamente');
      } catch (error) {
        toast('Spazio di salvataggio esaurito: esporta la mappa in JSON.');
      }
    }, 350);
  }

  function saveNow(showToast = true) {
    clearTimeout(state.saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      if (showToast) toast('Mappa salvata su questo dispositivo! 💾');
      return true;
    } catch (error) {
      toast('Non riesco a salvare: esporta la mappa in JSON.');
      return false;
    }
  }

  function restore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return 0;
      const data = normalizeData(JSON.parse(saved));
      const removedRemoteImages = confirmRemoteImages(data.nodes);
      Object.assign(state, data);
      return removedRemoteImages;
    } catch (error) {
      console.warn('Salvataggio locale non leggibile:', error);
      return 0;
    }
  }

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
  }

  function screenPoint(event) {
    const rect = board.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * state.width / rect.width,
      y: (event.clientY - rect.top) * state.height / rect.height,
    };
  }

  function worldPoint(event) {
    const screen = screenPoint(event);
    return { x: (screen.x - state.x) / state.scale, y: (screen.y - state.y) / state.scale };
  }

  function createNode(type, x, y) {
    if (!TYPES.has(type)) return null;
    const [w, h] = SIZE[type];
    const node = {
      id: makeId('node'), type, x: x - w / 2, y: y - h / 2, w, h,
      autoFit: true,
      fontFamily: state.fontFamily,
      fontSize: null, bold: false, italic: false, underline: false,
      textColor: '#17243d', textAlign: 'center',
      text: type === 'text' ? 'Scrivi un concetto' : type === 'mascot' ? 'Ciao! Quale concetto scopriamo?' : type === 'image' ? '' : 'Nuovo concetto',
      color: COLORS[state.nodes.length % (COLORS.length - 1)], imageUrl: '', sourceTitle: '', license: '',
      emoji: '🦊', name: 'Maia la Volpe',
    };
    fitNodeGeometry(node);
    state.nodes.push(node);
    state.selectedId = node.id;
    state.selectedLinkId = null;
    render();
    if (type === 'image') openImageEditor(node.id);
    if (type === 'mascot') openMascotEditor(node.id);
    return node;
  }

  function addAtBoardCenter(type) {
    const index = state.nodes.length % 8;
    const screen = { x: state.width / 2 + (index % 4) * 18, y: state.height / 2 + Math.floor(index / 4) * 18 };
    createNode(type, (screen.x - state.x) / state.scale, (screen.y - state.y) / state.scale);
  }

  function deleteNode(id) {
    state.nodes = state.nodes.filter((node) => node.id !== id);
    state.links = state.links.filter((link) => link.from !== id && link.to !== id);
    if (state.selectedId === id) state.selectedId = null;
    if (state.editorId === id) closeModals();
    render();
    toast('Elemento eliminato.');
  }

  function deleteSelected() {
    if (state.selectedId) deleteNode(state.selectedId);
    else if (state.selectedLinkId) {
      state.links = state.links.filter((link) => link.id !== state.selectedLinkId);
      state.selectedLinkId = null;
      render();
      toast('Collegamento eliminato.');
    }
  }

  function selectNode(id) {
    state.selectedId = id;
    state.selectedLinkId = null;
    hideContextMenu();
    render();
  }

  function beginLink(id, side) {
    state.linkDraft = { id, side, pointer: null };
    state.selectedId = id;
    state.selectedLinkId = null;
    board.classList.add('connecting');
    render();
  }

  function nodeAtPoint(pointer, excludeId, physicalTarget) {
    const port = physicalTarget && physicalTarget.closest ? physicalTarget.closest('.port') : null;
    if (port && port.dataset.nodeId !== excludeId) {
      const node = state.nodes.find((item) => item.id === port.dataset.nodeId);
      if (node) return { node, side: port.dataset.side };
    }
    const hitNode = physicalTarget && physicalTarget.closest ? physicalTarget.closest('.node') : null;
    if (hitNode && hitNode.dataset.nodeId !== excludeId) {
      const node = state.nodes.find((item) => item.id === hitNode.dataset.nodeId);
      if (node) return { node, side: null };
    }
    const candidates = state.nodes.filter((node) => node.id !== excludeId);
    const containing = candidates.filter((node) => {
      const [w, h] = nodeSize(node);
      return pointer.x >= node.x && pointer.x <= node.x + w && pointer.y >= node.y && pointer.y <= node.y + h;
    });
    if (containing.length) return { node: containing[containing.length - 1], side: null };
    let nearest = null;
    for (const node of candidates) {
      for (const side of Object.keys(SIDE)) {
        const p = portPoint(node, side);
        const distance = Math.hypot(pointer.x - p.x, pointer.y - p.y);
        if (!nearest || distance < nearest.distance) nearest = { node, side, distance };
      }
    }
    return nearest && nearest.distance <= 32 / state.scale ? { node: nearest.node, side: nearest.side } : null;
  }

  function sideNearestTo(node, pointer) {
    return Object.keys(SIDE).reduce((best, side) => {
      const p = portPoint(node, side), b = portPoint(node, best);
      return Math.hypot(pointer.x - p.x, pointer.y - p.y) < Math.hypot(pointer.x - b.x, pointer.y - b.y) ? side : best;
    }, 'top');
  }

  function finishLink(event) {
    if (!state.linkDraft) return;
    const physicalTarget = document.elementFromPoint(event.clientX, event.clientY);
    const pointer = worldPoint(event);
    const targetHit = nodeAtPoint(pointer, state.linkDraft.id, physicalTarget);
    const sourceId = state.linkDraft.id;
    if (targetHit) {
      const target = targetHit.node;
      const toSide = targetHit.side || sideNearestTo(target, pointer);
      const fromSide = state.linkDraft.side;
      const duplicate = state.links.some((item) =>
        (item.from === sourceId && item.fromSide === fromSide && item.to === target.id && item.toSide === toSide) ||
        (item.to === sourceId && item.toSide === fromSide && item.from === target.id && item.fromSide === toSide));
      if (!duplicate) {
        state.links.push({ id: makeId('link'), from: sourceId, fromSide, to: target.id, toSide, label: '' });
        toast('Concetti collegati! 🔗');
      } else toast('Questi concetti sono già collegati.');
    } else {
      state.links.push({ id: makeId('link'), from: sourceId, fromSide: state.linkDraft.side, to: null, toSide: null, freeEnd: pointer, label: '' });
      state.selectedId = null;
      state.selectedLinkId = state.links[state.links.length - 1].id;
      toast('Collegamento lasciato sospeso. Trascina il punto finale per agganciarlo a una forma.');
    }
    state.linkDraft = null;
    board.classList.remove('connecting');
    tempLink.style.display = 'none';
    render();
  }

  function finishFreeEndpointDrag(event) {
    if (!state.linkEndDrag) return;
    const link = state.links.find((item) => item.id === state.linkEndDrag.id);
    if (!link) return;
    const pointer = worldPoint(event);
    const isFrom = state.linkEndDrag.role.endsWith('from') || state.linkEndDrag.role === 'from';
    const role = isFrom ? 'from' : 'to';
    const otherEndId = isFrom ? link.to : link.from;
    const physicalTarget = document.elementFromPoint(event.clientX, event.clientY);
    const targetHit = nodeAtPoint(pointer, otherEndId, physicalTarget);
    if (targetHit) {
      if (role === 'from') {
        link.from = targetHit.node.id;
        link.fromSide = targetHit.side || sideNearestTo(targetHit.node, pointer);
        delete link.freeStart;
      } else {
        link.to = targetHit.node.id;
        link.toSide = targetHit.side || sideNearestTo(targetHit.node, pointer);
        delete link.freeEnd;
      }
      toast('Estremità agganciata alla forma.');
    } else {
      if (role === 'from') link.freeStart = pointer;
      else link.freeEnd = pointer;
    }
    state.selectedLinkId = link.id;
    render();
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const endpoint = event.target.closest && event.target.closest('.link-endpoint');
    if (endpoint) {
      event.preventDefault();
      event.stopPropagation();
      const role = endpoint.dataset.linkEndRole;
      const connected = role === 'from' || role === 'to';
      state.linkEndDrag = { id: endpoint.dataset.linkEndId, role, pending: connected, startX: event.clientX, startY: event.clientY };
      state.selectedLinkId = endpoint.dataset.linkEndId;
      state.selectedId = null;
      render();
      board.setPointerCapture?.(event.pointerId);
      return;
    }
    const port = event.target.closest && event.target.closest('.port');
    if (port) {
      event.preventDefault();
      event.stopPropagation();
      beginLink(port.dataset.nodeId, port.dataset.side);
      const screen = screenPoint(event);
      const node = state.nodes.find((item) => item.id === port.dataset.nodeId);
      const start = portPoint(node, port.dataset.side);
      tempLink.setAttribute('d', `M ${start.x} ${start.y} L ${(screen.x - state.x) / state.scale} ${(screen.y - state.y) / state.scale}`);
      board.setPointerCapture?.(event.pointerId);
      return;
    }

    const resizeHandle = event.target.closest && event.target.closest('.resize-handle');
    if (resizeHandle) {
      const node = state.nodes.find((item) => item.id === resizeHandle.dataset.nodeId);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      selectNode(node.id);
      const point = worldPoint(event), [w, h] = nodeSize(node);
      node.autoFit = false;
      state.resize = { id: node.id, startX: point.x, startY: point.y, w, h, fontSize: node.fontSize };
      board.setPointerCapture?.(event.pointerId);
      return;
    }

    const nodeGroup = event.target.closest && event.target.closest('.node');
    if (nodeGroup) {
      const node = state.nodes.find((item) => item.id === nodeGroup.dataset.nodeId);
      if (!node) return;
      event.preventDefault();
      selectNode(node.id);
      const point = worldPoint(event);
      state.drag = { id: node.id, startX: point.x, startY: point.y, x: node.x, y: node.y };
      board.setPointerCapture?.(event.pointerId);
      return;
    }

    if (event.target === board || event.target.id === 'bg' || event.target === viewport || event.target === nodesLayer || event.target === linksLayer) {
      state.selectedId = null;
      state.selectedLinkId = null;
      render();
      const point = screenPoint(event);
      state.pan = { startX: point.x, startY: point.y, x: state.x, y: state.y };
      board.classList.add('panning');
      board.setPointerCapture?.(event.pointerId);
    }
  }

  function onPointerMove(event) {
    if (state.linkDraft) {
      const node = state.nodes.find((item) => item.id === state.linkDraft.id);
      if (!node) return;
      const start = portPoint(node, state.linkDraft.side);
      const screen = screenPoint(event);
      const end = { x: (screen.x - state.x) / state.scale, y: (screen.y - state.y) / state.scale };
      const sideVector = SIDE[state.linkDraft.side];
      const length = Math.max(36, Math.min(120, Math.hypot(end.x - start.x, end.y - start.y) * .35));
      tempLink.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + sideVector[0] * length} ${start.y + sideVector[1] * length}, ${end.x} ${end.y}, ${end.x} ${end.y}`);
      return;
    }
    if (state.linkEndDrag) {
      const link = state.links.find((item) => item.id === state.linkEndDrag.id);
      if (!link) return;
      const drag = state.linkEndDrag;
      if (drag.pending) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
        detachLinkEndpoint(link, drag.role);
        drag.pending = false;
      }
      if (drag.role.endsWith('from')) link.freeStart = worldPoint(event);
      else link.freeEnd = worldPoint(event);
      render();
      return;
    }
    if (state.resize) {
      const point = worldPoint(event);
      const node = state.nodes.find((item) => item.id === state.resize.id);
      if (!node) return;
      const nextW = state.resize.w + point.x - state.resize.startX;
      const nextH = state.resize.h + point.y - state.resize.startY;
      resizeNode(node, nextW, nextH, state.resize.w, state.resize.h, state.resize.fontSize);
      render();
      return;
    }
    if (state.drag) {
      const point = worldPoint(event);
      const node = state.nodes.find((item) => item.id === state.drag.id);
      if (!node) return;
      node.x = state.drag.x + point.x - state.drag.startX;
      node.y = state.drag.y + point.y - state.drag.startY;
      render();
      return;
    }
    if (state.pan) {
      const point = screenPoint(event);
      state.x = state.pan.x + point.x - state.pan.startX;
      state.y = state.pan.y + point.y - state.pan.startY;
      render();
    }
  }

  function onPointerUp(event) {
    if (state.linkDraft) finishLink(event);
    else if (state.linkEndDrag && !state.linkEndDrag.pending) finishFreeEndpointDrag(event);
    state.drag = null;
    state.pan = null;
    state.resize = null;
    state.linkEndDrag = null;
    board.classList.remove('connecting');
    board.classList.remove('panning');
  }

  function zoomTo(nextScale, sx = state.width / 2, sy = state.height / 2) {
    const scale = Math.max(.25, Math.min(2.5, nextScale));
    const worldX = (sx - state.x) / state.scale;
    const worldY = (sy - state.y) / state.scale;
    state.scale = scale;
    state.x = sx - worldX * scale;
    state.y = sy - worldY * scale;
    render();
  }

  function fitMap() {
    const bounds = mapBounds();
    if (!bounds) {
      state.x = 0; state.y = 0; state.scale = 1; render(); return;
    }
    const margin = 70;
    const { minX, minY, maxX, maxY } = bounds;
    const scale = Math.min(1.6, (state.width - margin * 2) / Math.max(1, maxX - minX), (state.height - margin * 2) / Math.max(1, maxY - minY));
    state.scale = Math.max(.25, scale);
    state.x = (state.width - (maxX - minX) * state.scale) / 2 - minX * state.scale;
    state.y = (state.height - (maxY - minY) * state.scale) / 2 - minY * state.scale;
    render();
  }

  function updateSelectionTools() {
    const tools = $('selection-tools');
    const node = state.nodes.find((item) => item.id === state.selectedId);
    tools.classList.toggle('visible', Boolean(node));
    if (!node) return;
    $('node-font').value = FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily;
    $('node-font').style.fontFamily = `"${$('node-font').value}", sans-serif`;
    $('node-font-size').value = node.fontSize == null ? '' : String(node.fontSize);
    $('node-bold').setAttribute('aria-pressed', String(node.bold === true));
    $('node-italic').setAttribute('aria-pressed', String(node.italic === true));
    $('node-underline').setAttribute('aria-pressed', String(node.underline === true));
    $('node-text-color').value = /^#[\da-f]{6}$/i.test(node.textColor || '') ? node.textColor : '#17243d';
    $('node-text-align').value = ['left', 'center', 'right'].includes(node.textAlign) ? node.textAlign : 'center';
    const [baseW, baseH] = SIZE[node.type] || SIZE.rect;
    const [w, h] = nodeSize(node);
    const ratioW = w / baseW, ratioH = h / baseH;
    const presets = { small: .72, medium: 1, large: 1.35 };
    const match = Object.entries(presets).find(([, ratio]) => Math.abs(ratioW - ratio) < .075 && Math.abs(ratioH - ratio) < .075);
    $('node-size-preset').value = match ? match[0] : 'custom';
  }

  function hideContextMenu() {
    $('node-context-menu').classList.remove('open');
    $('link-context-menu').classList.remove('open');
    state.contextNodeId = null;
    state.contextLinkId = null;
  }

  function setNodeSizePreset(id, preset) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    if (preset === 'custom') { openSizeEditor(id); return; }
    const ratio = { small: .72, medium: 1, large: 1.35 }[preset];
    if (!ratio) return;
    const [baseW, baseH] = SIZE[node.type] || SIZE.rect;
    const [oldW, oldH] = nodeSize(node);
    node.autoFit = false;
    resizeNode(node, baseW * ratio, baseH * ratio, oldW, oldH);
    state.selectedId = node.id;
    state.selectedLinkId = null;
    render();
    toast(`Dimensione ${preset === 'small' ? 'piccola' : preset === 'large' ? 'grande' : 'media'} applicata.`);
  }

  function duplicateNode(id) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    const duplicate = { ...node, id: makeId('node'), x: node.x + 28, y: node.y + 28 };
    state.nodes.push(duplicate);
    state.selectedId = duplicate.id;
    state.selectedLinkId = null;
    render();
    toast('Forma duplicata.');
  }

  function openSizeEditor(id) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    state.editorId = id;
    const [w, h] = nodeSize(node);
    $('node-width').value = w;
    $('node-height').value = h;
    openModal(modalSize);
    $('node-width').focus();
    $('node-width').select();
  }

  function openModal(modal) {
    [modalText, modalImage, modalMascot, modalSize].forEach((item) => item.classList.remove('open'));
    modal.classList.add('open');
  }

  function closeModals() {
    [modalText, modalImage, modalMascot, modalSize].forEach((modal) => modal.classList.remove('open'));
    state.editorId = null;
  }

  function openTextEditor(id) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    state.editorId = id;
    state.paletteColor = node.color || COLORS[0];
    $('text-input').value = node.text || '';
    $('text-colors').replaceChildren();
    COLORS.forEach((color) => {
      const dot = document.createElement('button');
      dot.type = 'button'; dot.className = `color-dot${node.color === color ? ' sel' : ''}`;
      dot.style.background = color; dot.setAttribute('aria-label', `Colore ${color}`);
      dot.addEventListener('click', () => {
        state.paletteColor = color;
        $('text-colors').querySelectorAll('.color-dot').forEach((item) => item.classList.toggle('sel', item === dot));
      });
      $('text-colors').appendChild(dot);
    });
    $('btn-delete-node').style.display = 'inline-flex';
    openModal(modalText);
    $('text-input').focus();
  }

  function openImageEditor(id) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    state.editorId = id;
    state.imageSelection = node.imageUrl ? { url: node.imageUrl, title: node.sourceTitle, license: node.license } : null;
    $('img-url').value = node.imageUrl || '';
    $('img-caption').value = node.text || '';
    $('img-search').value = '';
    $('img-results').replaceChildren();
    $('btn-img-search').disabled = false;
    openModal(modalImage);
    $('img-url').focus();
  }

  function openMascotEditor(id) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    state.editorId = id;
    $('mascot-text').value = node.text || '';
    const picker = $('mascot-picker');
    picker.replaceChildren();
    MASCOTS.forEach((mascot) => {
      const option = document.createElement('button');
      option.type = 'button'; option.className = `mascot-opt${node.emoji === mascot.emoji ? ' sel' : ''}`;
      option.textContent = mascot.emoji; option.title = mascot.name; option.setAttribute('aria-label', mascot.name);
      option.addEventListener('click', () => {
        picker.querySelectorAll('.mascot-opt').forEach((item) => item.classList.toggle('sel', item === option));
      });
      picker.appendChild(option);
    });
    openModal(modalMascot);
    $('mascot-text').focus();
  }

  function editSelected() {
    const node = state.nodes.find((item) => item.id === state.selectedId);
    if (!node) return;
    if (node.type === 'image') openImageEditor(node.id);
    else if (node.type === 'mascot') openMascotEditor(node.id);
    else openTextEditor(node.id);
  }

  async function searchWikimedia() {
    const query = $('img-search').value.trim();
    if (!query) { toast('Scrivi cosa vuoi cercare.'); $('img-search').focus(); return; }
    const button = $('btn-img-search');
    const results = $('img-results');
    button.disabled = true; button.textContent = 'Cerco…';
    results.textContent = 'Sto cercando immagini libere su Wikimedia Commons…';
    try {
      const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '18', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '360', format: 'json', origin: '*' });
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
      if (!response.ok) throw new Error(`Risposta Wikimedia ${response.status}`);
      const data = await response.json();
      const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
      results.replaceChildren();
      if (!pages.length) { results.textContent = 'Non ho trovato immagini. Prova con un’altra parola.'; return; }
      pages.forEach((page) => {
        const info = page.imageinfo && page.imageinfo[0];
        if (!info) return;
        const url = safeImageUrl(info.url);
        const thumb = safeImageUrl(info.thumburl) || url;
        if (!url || !thumb) return;
        const title = String(page.title || '').replace(/^File:/, '');
        const license = info.extmetadata?.LicenseShortName?.value || info.extmetadata?.UsageTerms?.value || '';
        const credit = info.extmetadata?.Artist?.value || '';
        const option = document.createElement('button');
        option.type = 'button'; option.className = 'image-result'; option.title = `${title}${license ? ` · ${license}` : ''}`;
        const image = document.createElement('img'); image.src = thumb; image.alt = title; image.loading = 'lazy';
        const caption = document.createElement('span'); caption.textContent = title.length > 30 ? `${title.slice(0, 27)}…` : title;
        option.append(image, caption);
        option.addEventListener('click', () => {
          state.imageSelection = { url, title, license: [license, credit ? `Autore: ${credit}` : ''].filter(Boolean).join(' · ') };
          $('img-url').value = url;
          results.querySelectorAll('.image-result').forEach((item) => item.classList.toggle('selected', item === option));
        });
        results.appendChild(option);
      });
    } catch (error) {
      console.error(error);
      results.textContent = 'Ricerca non riuscita. Controlla la connessione o incolla direttamente un URL immagine.';
    } finally {
      button.disabled = false; button.textContent = '🔍 Cerca';
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'mappa-concettuale.json');
    toast('Mappa esportata in JSON.');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function stylesheetText() {
    let css = '';
    const usedFonts = new Set([state.fontFamily, ...state.nodes.map((node) => FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily)]);
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
            if (!usedFonts.has(family)) continue;
          }
          css += `${rule.cssText}\n`;
        }
      }
      catch (error) { console.warn('Uno stile non è accessibile durante export:', error); }
    }
    return css;
  }

  function fileAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Impossibile leggere un’immagine.'));
      reader.readAsDataURL(blob);
    });
  }

  async function exportPng() {
    if (!state.nodes.length) { toast('Aggiungi almeno una forma prima di creare il PNG.'); return; }
    try {
      const margin = 60;
      const { minX, minY, maxX, maxY } = mapBounds();
      const usedFonts = [...new Set([state.fontFamily, ...state.nodes.map((node) => FONT_FAMILIES.has(node.fontFamily) ? node.fontFamily : state.fontFamily)])];
      await Promise.all(usedFonts.map((family) => document.fonts.load(`700 19px "${family}"`)));
      const width = Math.ceil(maxX - minX + margin * 2);
      const height = Math.ceil(maxY - minY + margin * 2);
      const clone = board.cloneNode(true);
      clone.setAttribute('xmlns', SVG_NS);
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      clone.querySelector('#bg')?.setAttribute('width', width);
      clone.querySelector('#bg')?.setAttribute('height', height);
      clone.querySelector('#viewport')?.setAttribute('transform', `translate(${margin - minX} ${margin - minY}) scale(1)`);
      clone.querySelector('#temp-link')?.remove();
      clone.querySelectorAll('.resize-handle').forEach((handle) => handle.remove());
      clone.querySelectorAll('.connected-endpoint').forEach((handle) => handle.remove());
      const style = document.createElementNS(SVG_NS, 'style');
      style.textContent = stylesheetText();
      clone.insertBefore(style, clone.firstChild);

      for (const image of Array.from(clone.querySelectorAll('image'))) {
        const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (!href || href.startsWith('data:')) continue;
        try {
          const response = await fetch(href, { mode: 'cors' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          image.setAttribute('href', await fileAsDataUrl(await response.blob()));
        } catch (error) {
          throw new Error('Un’immagine esterna non consente il download per l’esportazione. Prova a scegliere un’immagine Wikimedia o un URL con accesso pubblico.');
        }
      }

      const ratio = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(12000000 / (width * height)));
      const output = new Image();
      const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise((resolve, reject) => { output.onload = resolve; output.onerror = () => reject(new Error('Impossibile comporre l’immagine PNG.')); output.src = svgUrl; });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#f4f6ff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(output, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Il browser non ha creato il file PNG.');
      downloadBlob(blob, 'mappa-concettuale.png');
      toast('Immagine PNG pronta! 🖼️');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Esportazione PNG non riuscita.');
    }
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = normalizeData(JSON.parse(String(reader.result)));
        const removedRemoteImages = confirmRemoteImages(data.nodes);
        state.nodes = data.nodes; state.links = data.links;
        state.fontFamily = data.fontFamily;
        state.x = data.x; state.y = data.y; state.scale = data.scale;
        state.selectedId = null; state.selectedLinkId = null;
        $('map-font').value = state.fontFamily;
        $('map-font').style.fontFamily = `"${state.fontFamily}", sans-serif`;
        render(); saveNow(false);
        toast(removedRemoteImages
          ? `Mappa importata; rimoss${removedRemoteImages === 1 ? 'a 1 immagine' : `e ${removedRemoteImages} immagini`} estern${removedRemoteImages === 1 ? 'a' : 'e'}.`
          : 'Mappa importata!');
      } catch (error) {
        toast(error.message || 'Il file non è un JSON valido.');
      } finally { $('file-import').value = ''; }
    };
    reader.onerror = () => toast('Non riesco a leggere questo file.');
    reader.readAsText(file);
  }

  function resetMap() {
    if (!state.nodes.length && !state.links.length) { toast('La lavagna è già vuota.'); return; }
    if (!window.confirm('Vuoi cancellare tutti gli elementi della mappa?')) return;
    state.nodes = []; state.links = []; state.selectedId = null; state.selectedLinkId = null;
    state.x = 0; state.y = 0; state.scale = 1;
    render(); saveNow(false); toast('Lavagna pulita.');
  }

  function populateFontSizeOptions() {
    const select = $('node-font-size');
    for (let size = 8; size <= 48; size += 1) {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = `${size} pt`;
      select.appendChild(option);
    }
  }

  function refreshSize() {
    const rect = board.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    board.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    render();
  }

  function bindEvents() {
    const boardWrap = $('board-wrap');
    const contextMenu = $('node-context-menu');
    const linkContextMenu = $('link-context-menu');
    boardWrap.addEventListener('contextmenu', (event) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY) || event.target;
      const nodeElement = hit.closest && hit.closest('.node');
      const bounds = boardWrap.getBoundingClientRect();
      if (nodeElement) {
        event.preventDefault();
        event.stopPropagation();
        const id = nodeElement.dataset.nodeId;
        selectNode(id);
        state.contextNodeId = id;
        contextMenu.classList.add('open');
        const menuWidth = contextMenu.offsetWidth, menuHeight = contextMenu.offsetHeight;
        contextMenu.style.left = `${Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - menuWidth - 8))}px`;
        contextMenu.style.top = `${Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - menuHeight - 8))}px`;
        contextMenu.querySelector('[data-action="edit"]').focus();
        return;
      }
      const linkElement = hit.closest && hit.closest('[data-link-id], [data-link-end-id]');
      const linkId = linkElement?.dataset.linkId || linkElement?.dataset.linkEndId;
      const link = state.links.find((item) => item.id === linkId);
      if (!link) { hideContextMenu(); return; }
      event.preventDefault();
      event.stopPropagation();
      hideContextMenu();
      state.contextLinkId = link.id;
      state.selectedId = null;
      state.selectedLinkId = link.id;
      render();
      linkContextMenu.querySelector('[data-action="link-direction-both"]').textContent = link.direction === 'both' ? '↔ Rendi unidirezionale' : '↔ Rendi bidirezionale';
      linkContextMenu.classList.add('open');
      const menuWidth = linkContextMenu.offsetWidth, menuHeight = linkContextMenu.offsetHeight;
      linkContextMenu.style.left = `${Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - menuWidth - 8))}px`;
      linkContextMenu.style.top = `${Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - menuHeight - 8))}px`;
      linkContextMenu.querySelector('[data-action="link-direction-both"]').focus();
    });
    contextMenu.addEventListener('click', (event) => {
      const actionButton = event.target.closest && event.target.closest('[data-action]');
      if (!actionButton) return;
      event.preventDefault();
      const id = state.contextNodeId;
      const action = actionButton.dataset.action;
      hideContextMenu();
      if (!id) return;
      state.selectedId = id;
      if (action === 'edit') editSelected();
      else if (action === 'duplicate') duplicateNode(id);
      else if (action === 'delete') deleteNode(id);
      else if (action === 'size') setNodeSizePreset(id, actionButton.dataset.size);
      else if (action === 'custom-size') openSizeEditor(id);
    });
    linkContextMenu.addEventListener('click', (event) => {
      const actionButton = event.target.closest && event.target.closest('[data-action]');
      if (!actionButton) return;
      event.preventDefault();
      const link = state.links.find((item) => item.id === state.contextLinkId);
      const action = actionButton.dataset.action;
      hideContextMenu();
      if (!link) return;
      if (action === 'link-delete') {
        state.links = state.links.filter((item) => item.id !== link.id);
        state.selectedLinkId = null;
        render();
        toast('Freccia eliminata.');
      } else if (action === 'link-direction-both') {
        link.direction = link.direction === 'both' ? 'forward' : 'both';
        state.selectedLinkId = link.id;
        render();
      } else if (action === 'link-reverse') {
        link.direction = link.direction === 'reverse' ? 'forward' : 'reverse';
        state.selectedLinkId = link.id;
        render();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!contextMenu.contains(event.target) && !linkContextMenu.contains(event.target)) hideContextMenu();
    });

    document.querySelectorAll('.pal-btn').forEach((button) => {
      button.draggable = true;
      button.addEventListener('click', () => addAtBoardCenter(button.dataset.add));
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/x-map-type', button.dataset.add);
        event.dataTransfer.effectAllowed = 'copy';
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addAtBoardCenter(button.dataset.add); }
      });
    });
    board.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    board.addEventListener('drop', (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/x-map-type');
      const point = worldPoint(event);
      if (TYPES.has(type)) createNode(type, point.x, point.y);
    });
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);
    board.addEventListener('dblclick', (event) => {
      // Pointer capture used for dragging can retarget dblclick to the SVG board.
      // Hit-test the actual release position so editing still opens on the shape.
      const hit = document.elementFromPoint(event.clientX, event.clientY) || event.target;
      const pointer = worldPoint(event);
      const endpoint = hit.closest && hit.closest('.link-endpoint');
      if (endpoint) {
        const item = state.links.find((candidate) => candidate.id === endpoint.dataset.linkEndId);
        const role = endpoint.dataset.linkEndRole;
        if (item && detachLinkEndpoint(item, role)) {
          state.selectedId = null;
          state.selectedLinkId = item.id;
          render();
          toast('Punta scollegata. Trascinala su un altro punto di aggancio.');
        }
        return;
      }
      let nearestAttached = null;
      for (const item of state.links) {
        const fromNode = state.nodes.find((candidate) => candidate.id === item.from);
        const toNode = state.nodes.find((candidate) => candidate.id === item.to);
        for (const entry of [
          fromNode ? { role: 'from', point: portPoint(fromNode, item.fromSide) } : null,
          toNode ? { role: 'to', point: portPoint(toNode, item.toSide) } : null,
        ]) {
          if (!entry) continue;
          const distance = Math.hypot(pointer.x - entry.point.x, pointer.y - entry.point.y);
          if (!nearestAttached || distance < nearestAttached.distance) nearestAttached = { item, role: entry.role, distance };
        }
      }
      if (nearestAttached && nearestAttached.distance <= 18 / state.scale && detachLinkEndpoint(nearestAttached.item, nearestAttached.role)) {
        state.selectedId = null;
        state.selectedLinkId = nearestAttached.item.id;
        render();
        toast('Punta scollegata. Trascinala su un altro punto di aggancio.');
        return;
      }
      const node = hit.closest && hit.closest('.node');
      if (node) { state.selectedId = node.dataset.nodeId; editSelected(); return; }
      const link = hit.closest && (hit.closest('.link') || hit.closest('[data-link-id]'));
      if (link) {
        const item = state.links.find((candidate) => candidate.id === link.dataset.linkId);
        if (item) { const label = window.prompt('Scrivi una parola che descrive il collegamento:', item.label || ''); if (label !== null) { item.label = label.slice(0, 180); render(); } }
      }
    });
    board.addEventListener('click', (event) => {
      const link = event.target.closest && event.target.closest('.link');
      if (link) { state.selectedId = null; state.selectedLinkId = link.dataset.linkId; render(); }
    });
    board.addEventListener('wheel', (event) => {
      event.preventDefault();
      const screen = screenPoint(event);
      zoomTo(state.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1), screen.x, screen.y);
    }, { passive: false });

    $('zoom-in').addEventListener('click', () => zoomTo(state.scale * 1.18));
    $('zoom-out').addEventListener('click', () => zoomTo(state.scale / 1.18));
    $('zoom-fit').addEventListener('click', fitMap);
    $('map-font').addEventListener('change', (event) => {
      if (!FONT_FAMILIES.has(event.target.value)) return;
      state.fontFamily = event.target.value;
      event.target.style.fontFamily = `"${state.fontFamily}", sans-serif`;
      state.nodes.forEach((node) => { node.fontFamily = state.fontFamily; fitNodeGeometry(node); });
      render();
      toast(`Carattere aggiornato in tutta la mappa: ${state.fontFamily}.`);
    });
    $('node-font').addEventListener('change', (event) => {
      const node = state.nodes.find((item) => item.id === state.selectedId);
      if (!node || !FONT_FAMILIES.has(event.target.value)) return;
      node.fontFamily = event.target.value;
      event.target.style.fontFamily = `"${node.fontFamily}", sans-serif`;
      fitNodeGeometry(node);
      render();
      toast(`Carattere della forma: ${node.fontFamily}.`);
    });
    $('node-font-size').addEventListener('change', (event) => {
      const node = state.nodes.find((item) => item.id === state.selectedId);
      if (!node) return;
      if (event.target.value === '') {
        node.fontSize = null;
        render();
        return;
      }
      const targetPt = Math.max(8, Math.min(48, Number(event.target.value)));
      const baseFont = node.type === 'image' ? 13 : node.type === 'mascot' ? 14 : node.type === 'text' ? 18 : 19;
      const currentPx = chosenTextSize(node, autoTextSize(node, baseFont));
      growNodeForText(node, targetPt * 4 / 3, currentPx);
      node.fontSize = targetPt;
      fitNodeGeometry(node);
      render();
    });
    [['node-bold', 'bold'], ['node-italic', 'italic'], ['node-underline', 'underline']].forEach(([id, property]) => {
      $(id).addEventListener('click', () => {
        const node = state.nodes.find((item) => item.id === state.selectedId);
        if (!node) return;
        node[property] = !node[property];
        fitNodeGeometry(node);
        render();
      });
    });
    $('node-text-color').addEventListener('change', (event) => {
      const node = state.nodes.find((item) => item.id === state.selectedId);
      if (!node || !/^#[\da-f]{6}$/i.test(event.target.value)) return;
      node.textColor = event.target.value;
      render();
    });
    $('node-text-align').addEventListener('change', (event) => {
      const node = state.nodes.find((item) => item.id === state.selectedId);
      if (!node || !['left', 'center', 'right'].includes(event.target.value)) return;
      node.textAlign = event.target.value;
      render();
    });
    $('btn-edit-selected').addEventListener('click', editSelected);
    $('btn-delete-selected').addEventListener('click', () => { if (state.selectedId) deleteNode(state.selectedId); });
    $('btn-custom-size').addEventListener('click', () => { if (state.selectedId) openSizeEditor(state.selectedId); });
    $('node-size-preset').addEventListener('change', (event) => {
      if (state.selectedId) setNodeSizePreset(state.selectedId, event.target.value);
    });
    $('size-cancel').addEventListener('click', closeModals);
    $('size-ok').addEventListener('click', () => {
      const node = state.nodes.find((item) => item.id === state.editorId);
      if (node) {
        const [oldW, oldH] = nodeSize(node);
        node.autoFit = false;
        resizeNode(node, $('node-width').value, $('node-height').value, oldW, oldH);
        state.selectedId = node.id;
        render();
      }
      closeModals();
    });
    $('btn-save').addEventListener('click', () => saveNow());
    $('btn-export').addEventListener('click', exportJson);
    $('btn-import').addEventListener('click', () => $('file-import').click());
    $('file-import').addEventListener('change', (event) => importJson(event.target.files[0]));
    $('btn-png').addEventListener('click', exportPng);
    $('btn-clear').addEventListener('click', resetMap);
    $('btn-img-search').addEventListener('click', searchWikimedia);
    $('img-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchWikimedia(); });

    $('text-ok').addEventListener('click', () => {
      const node = state.nodes.find((item) => item.id === state.editorId);
      if (node) { node.text = $('text-input').value.slice(0, 5000); node.color = state.paletteColor; fitNodeGeometry(node); render(); }
      closeModals();
    });
    $('text-cancel').addEventListener('click', closeModals);
    $('btn-delete-node').addEventListener('click', () => { const id = state.editorId; if (id) deleteNode(id); });
    $('img-cancel').addEventListener('click', closeModals);
    $('img-ok').addEventListener('click', () => {
      const node = state.nodes.find((item) => item.id === state.editorId);
      if (!node) { closeModals(); return; }
      const url = safeImageUrl($('img-url').value);
      if (!url) { toast('Inserisci un URL immagine http o https, oppure scegline una dalla ricerca.'); return; }
      node.imageUrl = url;
      node.sourceTitle = state.imageSelection?.url === url ? state.imageSelection.title : '';
      node.license = state.imageSelection?.url === url ? state.imageSelection.license : '';
      node.text = $('img-caption').value.slice(0, 500);
      fitNodeGeometry(node);
      render(); closeModals();
    });
    $('mascot-cancel').addEventListener('click', closeModals);
    $('mascot-ok').addEventListener('click', () => {
      const node = state.nodes.find((item) => item.id === state.editorId);
      const selected = $('mascot-picker').querySelector('.mascot-opt.sel');
      if (node) {
        const mascot = MASCOTS.find((item) => item.emoji === selected?.textContent) || MASCOTS[0];
        node.emoji = mascot.emoji; node.name = mascot.name; node.text = $('mascot-text').value.slice(0, 5000); fitNodeGeometry(node); render();
      }
      closeModals();
    });
    [modalText, modalImage, modalMascot, modalSize].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) closeModals(); }));

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const editing = target && (target.matches('input, textarea, select') || target.isContentEditable);
      if (event.key === 'Escape') { hideContextMenu(); closeModals(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveNow(); return; }
      if (editing) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
      else if (event.key === 'Enter' && state.selectedId) editSelected();
      else if (event.key === '+' || event.key === '=') zoomTo(state.scale * 1.18);
      else if (event.key === '-') zoomTo(state.scale / 1.18);
      else if (event.key === '0') fitMap();
    });
  }

  function start() {
    $('guido-char').textContent = '🦊';
    $('guido-char').setAttribute('aria-label', 'Maia la Volpe');
    populateFontSizeOptions();
    bindEvents();
    const removedRemoteImages = restore();
    $('map-font').value = FONT_FAMILIES.has(state.fontFamily) ? state.fontFamily : DEFAULT_FONT;
    $('map-font').style.fontFamily = `"${$('map-font').value}", sans-serif`;
    document.querySelectorAll('#map-font option, #node-font option').forEach((option) => {
      option.style.fontFamily = `"${option.value}", sans-serif`;
    });
    refreshSize();
    if (removedRemoteImages) {
      saveNow(false);
      toast(`Rimoss${removedRemoteImages === 1 ? 'a 1 immagine' : `e ${removedRemoteImages} immagini`} estern${removedRemoteImages === 1 ? 'a' : 'e'} dal salvataggio locale.`);
    }
    if (state.nodes.length) $('guido-bubble').innerHTML = 'Bentornato! Tasto destro su una forma per modificarla e ridimensionarla; doppio clic per aprire subito l’editor. 🦊';
    if ('ResizeObserver' in window) new ResizeObserver(refreshSize).observe($('board-wrap'));
    else window.addEventListener('resize', refreshSize);
    window.addEventListener('beforeunload', () => { clearTimeout(state.saveTimer); saveNow(false); });
  }

  start();
})();
