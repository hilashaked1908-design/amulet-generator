(function () {
  'use strict';

  const STORAGE_KEY = 'amuletQuestionnaire';
  const questions = window.AMULET_QUESTIONS || [];
  const isIndexPage = document.body.classList.contains('pagmar-index');
  const isCreatePage = document.body.classList.contains('pagmar-create');

  const stepRoot = document.getElementById('stepIndicators');
  const progressFill = document.getElementById('progressFill');
  const progressDots = document.getElementById('progressDots');

  const choicePanel = document.getElementById('choicePanel');
  const choiceTitle = document.getElementById('choiceTitle');
  const choiceQuestion = document.getElementById('choiceQuestion');
  const choiceOptions = document.getElementById('choiceOptions');

  const textPanel = document.getElementById('textPanel');
  const textLabel = document.getElementById('textLabel');
  const textQuestion = document.getElementById('textQuestion');
  const textField = document.getElementById('textField');
  const textSubmit = document.getElementById('textSubmit');
  const textClose = document.getElementById('textClose');

  const specPanel = document.getElementById('amuletSpecPanel');
  const specIndex = document.getElementById('amuletSpecIndex');

  const indexCreateWorkspace = document.getElementById('indexCreateWorkspace');
  const createAmuletSlot = document.getElementById('createAmuletSlot');
  const amuletStageParent = document.getElementById('questionStage');
  const pagmarCanvas = document.getElementById('pagmarCanvas');
  const questionGarden = document.getElementById('questionGarden');
  const GALLERY_VESSEL_ASSETS = [
    'assets/detail/loader-vessel-1.svg',
    'assets/detail/loader-vessel-2.svg',
    'assets/detail/loader-vessel-3.svg',
    'assets/detail/loader-vessel-4.svg',
  ];
  let createAmuletIdleSpinMounted = false;

  function stopCreateAmuletMorph() {
    const host = document.getElementById('createAmuletMorphHost');
    if (host) {
      host.classList.add('is-hidden');
      host.textContent = '';
      host.setAttribute('aria-hidden', 'true');
    }
    createAmuletIdleSpinMounted = false;
  }

  function resetCreateAmuletPreview() {
    const container = document.getElementById('amuletContainer');
    if (container) {
      container.innerHTML = '';
      container.hidden = false;
    }
    if (requestArtboard) {
      requestArtboard.classList.remove('is-amulet-live');
    }
  }

  function startCreateAmuletMorph() {
    if (!isCreateFlow()) return;
    const host = document.getElementById('createAmuletMorphHost');
    if (!host) return;
    const container = document.getElementById('amuletContainer');
    if (
      container &&
      (container.querySelector('canvas') ||
        container.querySelector('.pagmar__questionnaire-stage-vector'))
    ) {
      return;
    }

    host.classList.remove('is-hidden');
    host.setAttribute('aria-hidden', 'false');

    if (createAmuletIdleSpinMounted) return;

    const vessels = document.createElement('div');
    vessels.className = 'pagmar__amulet-frame-loader__vessels';
    vessels.setAttribute('aria-hidden', 'true');

    GALLERY_VESSEL_ASSETS.forEach(function (src, index) {
      const img = document.createElement('img');
      img.className =
        'pagmar__amulet-frame-loader__vessel pagmar__amulet-frame-loader__vessel--' + (index + 1);
      img.src = src;
      img.alt = '';
      img.decoding = 'sync';
      img.draggable = false;
      vessels.appendChild(img);
    });

    host.appendChild(vessels);
    createAmuletIdleSpinMounted = true;
  }

  window.pagmarHideCreateAmuletMorph = stopCreateAmuletMorph;
  window.pagmarStartCreateAmuletMorph = startCreateAmuletMorph;

  const requestProgressCurrent = document.getElementById('requestProgressCurrent');
  const requestProgressTotal = document.getElementById('requestProgressTotal');
  const requestArtboard = document.getElementById('requestArtboard');
  const requestActiveCard = document.getElementById('requestActiveCard');
  const requestCloseBtn = document.getElementById('requestCloseBtn');
  const requestAboutBtn = document.getElementById('requestAboutBtn');
  const requestStepMarkers = requestArtboard
    ? Array.from(requestArtboard.querySelectorAll('.figma-step-marker'))
    : [];

  const frame = document.getElementById('requestActiveCard') || document.getElementById('questionFrame');
  const frameStar = document.getElementById('questionFrameStar');
  const fieldWrap = document.getElementById('questionField');
  const submitBtn = document.getElementById('questionSubmit');
  const saveWrap =
    document.getElementById('questionSubmitWrap') ||
    (submitBtn &&
      (submitBtn.closest('.figma-q__btn-outer') || submitBtn.closest('.pagmar__create-save-wrap')));
  const labelEl = document.getElementById('questionLabel');
  const textEl = document.getElementById('questionText');
  const descEl = document.getElementById('questionDesc');
  const tagEl = document.getElementById('questionTag');
  const tagStepEl = document.getElementById('questionTagStep');
  const tagCategoryEl = document.getElementById('questionTagCategory');
  const vectorCopyEl = document.getElementById('questionVectorCopy');
  const vectorCopyTextEl = vectorCopyEl
    ? vectorCopyEl.querySelector('.figma-q__vector-copy-text')
    : null;
  const amuletStageCaptionEl = document.getElementById('amuletStageCaption');

  let activeIndex = null;
  let activeSpecIndex = null;
  let closeTimer = null;
  let indexCreateExitTimer = null;
  let requestTransitionTimer = null;
  const PANEL_MS = 300;
  const INDEX_TRANSITION_MS = 520;
  let createHistoryPushed = false;
  let createPopstateIgnore = 0;
  const REQUEST_TRANSITION_MS = 220;

  const CHOICE_TITLES = {
    q4Belief: 'אמונה',
    q5Feeling: 'תחושה',
    q6Difficulty: 'קושי',
  };

  const CREATE_SAVE_LABEL_NEXT = 'לשאלה הבאה';
  const CREATE_SAVE_LABEL_FINAL = 'צור קמע';

  /** Q8 (index 7) — last glass-bubble explanation in the questionnaire. */
  const LAST_EXPLAINED_QUESTION_INDEX = 7;

  /** Past tense — what changed after the previous answer (glass bubble on next frame). */
  const PAST_STAGE_CAPTION_BY_QUESTION = {
    1: 'האותיות מהבקשה התחברו ויצרו את קווי המתאר הראשונים של הקמע.',
    2: 'שכבת השם התווספה למתאר, האותיות של שמכם יוצרות בסיס לקמע.',
    3: 'האותיות מהתשובה שלכם הוטבעו על האבן.',
    4: 'חומריות האבן נקבעה מהאמונה שלכם.',
    5: 'חומריות המתכת או הפולימר נקבעה מהתחושה שלכם.',
    6: 'מידת הקוצניות נקבעה לפי מה שחסר לכם.',
    7: 'אותיות מהשינוי הוטבעו במעגל על האבן.',
  };

  function getPastStageCaptionText(questionIndex) {
    if (typeof questionIndex !== 'number' || questionIndex < 1) return '';
    return PAST_STAGE_CAPTION_BY_QUESTION[questionIndex] || '';
  }

  function isDockChoiceQuestionAt(index) {
    const question = questions[index];
    return Boolean(question && question.type === 'choice' && isRequestFlowActive());
  }

  function waitNextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  const PLACEHOLDER_CHAR_MS = 46;
  const PLACEHOLDER_HOLD_MS = 2600;
  const PLACEHOLDER_ERASE_MS = 24;
  const PLACEHOLDER_CURSOR = '▌';
  let placeholderCycleToken = 0;
  let placeholderFieldHandlers = null;

  function placeholderSleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function prefersPlaceholderMotion() {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function stopPlaceholderCycle() {
    placeholderCycleToken += 1;
    if (placeholderFieldHandlers) {
      const handlers = placeholderFieldHandlers;
      handlers.field.removeEventListener('focus', handlers.onFocus);
      handlers.field.removeEventListener('input', handlers.onInput);
      handlers.field.removeEventListener('blur', handlers.onBlur);
      handlers.field.classList.remove('is-typing-placeholder');
      placeholderFieldHandlers = null;
    }
  }

  function getPlaceholderExamples(question) {
    if (Array.isArray(question.placeholderExamples) && question.placeholderExamples.length) {
      return question.placeholderExamples;
    }
    if (question.placeholder) return [question.placeholder];
    return [];
  }

  function isPlaceholderFieldIdle(field) {
    return Boolean(field && !field.value.trim() && document.activeElement !== field);
  }

  function isPlaceholderSession(token) {
    return token === placeholderCycleToken;
  }

  let dockLiftObserver = null;

  function resetDockAmuletLift() {
    if (requestArtboard) {
      requestArtboard.style.removeProperty('--figma-amulet-lift');
      requestArtboard.style.removeProperty('--figma-q-dock-lift');
    }
  }

  function syncDockAmuletLift() {
    if (!requestArtboard || !isRequestFlowActive()) {
      resetDockAmuletLift();
      return;
    }

    const dock = document.querySelector('.figma-q__dock');
    if (!dock) {
      resetDockAmuletLift();
      return;
    }

    // Keep amulet frame + vector fog locked — never push them with dock height.
    requestArtboard.style.removeProperty('--figma-amulet-lift');

    if (document.body.classList.contains('is-choice-question')) {
      requestArtboard.style.removeProperty('--figma-q-dock-lift');
      syncAmuletStageCaptionPosition();
      syncRequestQuestionTextLayout();
      return;
    }

    const styles = window.getComputedStyle(dock);
    const baseline = parseFloat(styles.minHeight) || 0;
    const current = dock.getBoundingClientRect().height;
    const extra = Math.max(0, current - baseline);

    if (extra > 0.5) {
      requestArtboard.style.setProperty('--figma-q-dock-lift', '-' + extra + 'px');
    } else {
      requestArtboard.style.removeProperty('--figma-q-dock-lift');
    }
    syncAmuletStageCaptionPosition();
    syncRequestQuestionTextLayout();
  }

  function syncAmuletStageCaptionPosition() {
    if (!requestArtboard || !amuletStageCaptionEl) return;
    if (amuletStageCaptionEl.hidden) {
      requestArtboard.style.removeProperty('--figma-amulet-caption-top');
      return;
    }

    const stage = document.querySelector('.figma-amulet-stage');
    const dock = document.querySelector('.figma-q__dock');
    if (!stage || !dock) return;

    const stageRect = stage.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    if (!stageRect.height || !dockRect.height) return;

    const captionRect = amuletStageCaptionEl.getBoundingClientRect();
    const captionH = captionRect.height || 0;
    const midY = (stageRect.bottom + dockRect.top) / 2;
    const top = midY - captionH / 2;

    requestArtboard.style.setProperty('--figma-amulet-caption-top', top + 'px');
  }

  function ensureDockLiftObserver() {
    const dock = document.querySelector('.figma-q__dock');
    if (!dock) return;
    if (dockLiftObserver) {
      syncDockAmuletLift();
      return;
    }
    dockLiftObserver = new ResizeObserver(function () {
      syncDockAmuletLift();
    });
    dockLiftObserver.observe(dock);
    syncDockAmuletLift();
  }

  function stopDockLiftObserver() {
    if (dockLiftObserver) {
      dockLiftObserver.disconnect();
      dockLiftObserver = null;
    }
    resetDockAmuletLift();
  }

  function usesDockPlaceholderCycle(question) {
    return (
      isRequestFlowActive() &&
      Array.isArray(question.placeholderExamples) &&
      question.placeholderExamples.length >= 2
    );
  }

  function ensureDockPlaceholderExample(field, examples, preferredIndex) {
    if (!field || field.value.trim() || !examples.length) return;
    field.classList.remove('is-typing-placeholder');
    const idx = typeof preferredIndex === 'number' ? preferredIndex : 0;
    field.placeholder = examples[idx % examples.length] || examples[0];
  }

  async function runPlaceholderCycle(field, examples, token) {
    if (!examples.length || !isPlaceholderSession(token) || !field?.isConnected) return;

    if (!prefersPlaceholderMotion()) {
      ensureDockPlaceholderExample(field, examples, 0);
      return;
    }

    const requestFlow = isRequestFlowActive();
    let index = 0;

    while (isPlaceholderSession(token)) {
      if (!field.isConnected) return;

      if (!isPlaceholderFieldIdle(field)) {
        ensureDockPlaceholderExample(field, examples, index);
        return;
      }

      const text = examples[index % examples.length];

      if (requestFlow) {
        field.classList.remove('is-typing-placeholder');
        field.placeholder = text;
      } else {
        field.classList.add('is-typing-placeholder');
        const cursorChar = PLACEHOLDER_CURSOR;

        for (let i = 0; i <= text.length; i += 1) {
          if (!isPlaceholderSession(token) || !field.isConnected || !isPlaceholderFieldIdle(field)) {
            ensureDockPlaceholderExample(field, examples, index);
            return;
          }
          field.placeholder = i < text.length ? text.slice(0, i) + cursorChar : text;
          if (i < text.length) await placeholderSleep(PLACEHOLDER_CHAR_MS);
        }
      }

      await placeholderSleep(PLACEHOLDER_HOLD_MS);
      if (!isPlaceholderSession(token) || !field.isConnected || !isPlaceholderFieldIdle(field)) {
        ensureDockPlaceholderExample(field, examples, index);
        return;
      }

      for (let i = text.length; i >= 0; i -= 1) {
        if (!isPlaceholderSession(token) || !field.isConnected || !isPlaceholderFieldIdle(field)) {
          ensureDockPlaceholderExample(field, examples, index);
          return;
        }
        field.placeholder = i > 0 ? text.slice(0, i) : '';
        if (i > 0) await placeholderSleep(PLACEHOLDER_ERASE_MS);
      }

      index += 1;
    }
  }

  function startPlaceholderCycle(field, question) {
    stopPlaceholderCycle();
    const examples = getPlaceholderExamples(question);
    if (!field || !examples.length) return;

    if (field.value.trim()) {
      field.placeholder = question.placeholder || examples[0] || '';
      return;
    }

    if (!usesDockPlaceholderCycle(question)) {
      field.placeholder = question.placeholder || examples[0] || '';
      return;
    }

    field.placeholder = examples[0] || question.placeholder || '';

    const token = placeholderCycleToken;

    const onFocus = function () {
      placeholderCycleToken += 1;
      ensureDockPlaceholderExample(field, examples, 0);
    };

    const onInput = function () {
      if (field.value.trim()) {
        field.classList.remove('is-typing-placeholder');
        placeholderCycleToken += 1;
      }
    };

    const onBlur = function () {
      if (!isPlaceholderFieldIdle(field)) return;
      placeholderCycleToken += 1;
      const resumeToken = placeholderCycleToken;
      requestAnimationFrame(function () {
        void runPlaceholderCycle(field, examples, resumeToken);
      });
    };

    field.addEventListener('focus', onFocus);
    field.addEventListener('input', onInput);
    field.addEventListener('blur', onBlur);
    placeholderFieldHandlers = { field: field, onFocus: onFocus, onInput: onInput, onBlur: onBlur };

    const kickPlaceholderCycle = function () {
      if (placeholderFieldHandlers?.field !== field || !field.isConnected) return;
      if (!isPlaceholderFieldIdle(field)) return;
      void runPlaceholderCycle(field, examples, token);
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(kickPlaceholderCycle);
    });
    window.setTimeout(kickPlaceholderCycle, REQUEST_TRANSITION_MS + 32);
  }

  let amuletModulesReady = null;

  function ensureAmuletModules() {
    if (amuletModulesReady) return amuletModulesReady;
    amuletModulesReady = Promise.all([
      import('./amulet-build.js?v=20250709-full-site'),
      import('./amulet-show.js?v=20250711-result-amulet-scale'),
    ]).catch(function (err) {
      amuletModulesReady = null;
      throw err;
    });
    return amuletModulesReady;
  }

  function bindFigmaSubmitButtonHover() {
    document.querySelectorAll('.figma-q__btn-outer').forEach(function (outer) {
      if (outer.dataset.hoverBound === '1') return;
      outer.dataset.hoverBound = '1';

      outer.addEventListener('mouseenter', function () {
        outer.classList.add('is-hovered');
      });
      outer.addEventListener('mouseleave', function () {
        outer.classList.remove('is-hovered');
      });
      outer.addEventListener('focusin', function () {
        outer.classList.add('is-hovered');
      });
      outer.addEventListener('focusout', function () {
        outer.classList.remove('is-hovered');
      });
    });
  }

  function setCreateSaveLabel(index) {
    if (submitBtn) {
      const isLast = index === questions.length - 1;
      const text = isLast ? CREATE_SAVE_LABEL_FINAL : CREATE_SAVE_LABEL_NEXT;

      const requestLabel = submitBtn.querySelector('.figma-q__btn-label, .pagmar__request-next__label');
      if (requestLabel) {
        requestLabel.textContent = text;
      } else {
        const labels = submitBtn.querySelectorAll('.pagmar__create-save-label');
        labels.forEach(function (el) {
          el.textContent = text;
        });
      }

      const labelRoot =
        document.getElementById('questionSubmitWrap') ||
        submitBtn.closest('.figma-q__btn-outer') ||
        submitBtn.closest('.pagmar__create-save-wrap') ||
        submitBtn;
      labelRoot.style.setProperty('--create-save-label-w', isLast ? '118' : '134');
    }
  }

  function padQuestionNum(index) {
    return String(index + 1).padStart(2, '0');
  }

  function updateRequestProgress(index) {
    if (!isRequestFlowActive()) return;
    if (requestProgressCurrent) {
      requestProgressCurrent.textContent = padQuestionNum(index);
    }
    if (requestProgressTotal) {
      requestProgressTotal.textContent = '/ 08';
    }
    updateRequestStepRail(index);
  }

  function updateRequestStepRail(index) {
    if (!requestStepMarkers.length) return;
    const activeStep = index + 1;
    let activeMarker = null;
    requestStepMarkers.forEach(function (marker) {
      const step = Number(marker.dataset.step);
      const isActive = step === activeStep;
      marker.classList.toggle('is-active', isActive);
      marker.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      marker.setAttribute('aria-current', isActive ? 'step' : 'false');
      const numEl = marker.querySelector('.figma-step-marker__num');
      if (numEl) numEl.textContent = String(step).padStart(2, '0');
      if (isActive) activeMarker = marker;
    });
    applyRequestStepRailLines(activeMarker, activeStep);
  }

  function getRequestStepMarker(step) {
    return requestStepMarkers.find(function (marker) {
      return Number(marker.dataset.step) === step;
    }) || null;
  }

  function subtractRailSegment(segment, hole) {
    if (hole.end <= segment.start || hole.start >= segment.end) {
      return [segment];
    }
    const out = [];
    if (hole.start > segment.start + 0.5) {
      out.push({ start: segment.start, end: hole.start });
    }
    if (hole.end < segment.end - 0.5) {
      out.push({ start: hole.end, end: segment.end });
    }
    return out;
  }

  function applyStepRailMask(lineEl, height, segments) {
    if (!lineEl || !height) return;
    if (!segments.length) {
      const hidden = 'linear-gradient(to bottom, transparent 0%, transparent 100%)';
      lineEl.style.setProperty('-webkit-mask-image', hidden);
      lineEl.style.setProperty('mask-image', hidden);
      lineEl.style.setProperty('-webkit-mask-size', '100% 100%');
      lineEl.style.setProperty('mask-size', '100% 100%');
      lineEl.style.setProperty('-webkit-mask-repeat', 'no-repeat');
      lineEl.style.setProperty('mask-repeat', 'no-repeat');
      return;
    }
    const stops = ['transparent 0%'];
    segments.forEach(function (seg) {
      const startPct = ((seg.start / height) * 100).toFixed(2);
      const endPct = ((seg.end / height) * 100).toFixed(2);
      stops.push(
        'transparent ' + startPct + '%',
        '#000 ' + startPct + '%',
        '#000 ' + endPct + '%',
        'transparent ' + endPct + '%'
      );
    });
    stops.push('transparent 100%');
    const mask = 'linear-gradient(to bottom, ' + stops.join(', ') + ')';
    lineEl.style.setProperty('-webkit-mask-image', mask);
    lineEl.style.setProperty('mask-image', mask);
    lineEl.style.setProperty('-webkit-mask-size', '100% 100%');
    lineEl.style.setProperty('mask-size', '100% 100%');
    lineEl.style.setProperty('-webkit-mask-repeat', 'no-repeat');
    lineEl.style.setProperty('mask-repeat', 'no-repeat');
  }

  function getAllMarkerGaps(lineRect) {
    return requestStepMarkers
      .map(function (marker) {
        const markerRect = marker.getBoundingClientRect();
        const gapTop = Math.max(0, markerRect.top - lineRect.top);
        const gapBottom = Math.min(lineRect.height, markerRect.bottom - lineRect.top);
        if (gapBottom > gapTop + 1) {
          return { start: gapTop, end: gapBottom };
        }
        return null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.start - b.start;
      });
  }

  function subtractAllHoles(segment, holes) {
    return holes.reduce(function (segments, hole) {
      return segments.flatMap(function (seg) {
        return subtractRailSegment(seg, hole);
      });
    }, [segment]);
  }

  function applyRequestStepRailLines(activeMarker, activeStep) {
    if (!requestArtboard) return;
    const grayLine = requestArtboard.querySelector('.figma-step-rail__line--137');
    const whiteLine = requestArtboard.querySelector('.figma-step-rail__line--progress');
    if (!grayLine) return;

    requestAnimationFrame(function () {
      const lineRect = grayLine.getBoundingClientRect();
      if (!lineRect.height) return;

      const allGaps = getAllMarkerGaps(lineRect);
      const graySegments = subtractAllHoles({ start: 0, end: lineRect.height }, allGaps);
      applyStepRailMask(grayLine, lineRect.height, graySegments);

      if (!whiteLine) return;

      if (activeStep <= 1) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      const firstMarker = getRequestStepMarker(1);
      const activeStepMarker = getRequestStepMarker(activeStep);
      if (!firstMarker || !activeStepMarker) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      const firstRect = firstMarker.getBoundingClientRect();
      const activeRect = activeStepMarker.getBoundingClientRect();
      const progress = {
        start: Math.max(0, firstRect.top + firstRect.height * 0.5 - lineRect.top),
        end: Math.min(lineRect.height, activeRect.top + activeRect.height * 0.5 - lineRect.top),
      };

      if (progress.end <= progress.start + 1) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      const whiteSegments = subtractAllHoles(progress, allGaps);
      applyStepRailMask(whiteLine, lineRect.height, whiteSegments);
    });
  }

  function animateRequestQuestionChange(onSwap) {
    if (!requestArtboard) {
      if (onSwap) onSwap();
      return;
    }

    window.clearTimeout(requestTransitionTimer);
    requestArtboard.classList.add('is-advancing');

    requestTransitionTimer = window.setTimeout(function () {
      requestArtboard.classList.remove('is-advancing');
      if (onSwap) onSwap();
    }, REQUEST_TRANSITION_MS);
  }

  const CREATE_LAYOUT = {
    CONTENT_PAD_TOP: 32,
    CONTENT_PAD_BOTTOM: 32,
    HEAD_TEXT: 32,
    HEAD_GAP: 16,
    STACK_GAP: 24,
    SAVE_AREA: 39.15,
    OPTION_H: 48,
    TEXT_FIELD_H: 96,
    MIN_QUESTION_AREA: 262.767,
    AMULET_AREA: 635.188,
    STACK_BASE_H: 897.955,
  };

  function getQuestionHeadLineCount() {
    return 1;
  }

  function getChoiceRowIndices(optionCount, singleColumn) {
    if (singleColumn) {
      const rows = [];
      for (let i = 0; i < optionCount; i += 1) {
        rows.push([i]);
      }
      return rows;
    }
    if (optionCount === 5) return [[0, 3, 1], [2, 4]];
    const rows = [];
    for (let i = 0; i < optionCount; i += 3) {
      const row = [];
      for (let j = 0; j < 3 && i + j < optionCount; j++) {
        row.push(i + j);
      }
      rows.push(row);
    }
    return rows;
  }

  function getChoiceContentHeight(optionCount) {
    const rows = getChoiceRowIndices(optionCount);
    return rows.length * CREATE_LAYOUT.OPTION_H;
  }

  function getQuestionContentHeight(question) {
    const headH = CREATE_LAYOUT.HEAD_TEXT * getQuestionHeadLineCount(question);
    const fieldH =
      question.type === 'choice'
        ? getChoiceContentHeight(question.options.length)
        : CREATE_LAYOUT.TEXT_FIELD_H;
    return (
      headH +
      CREATE_LAYOUT.HEAD_GAP +
      fieldH +
      CREATE_LAYOUT.STACK_GAP +
      CREATE_LAYOUT.SAVE_AREA
    );
  }

  function getQuestionAreaHeight(question) {
    if (question.type === 'choice') {
      return Math.max(
        CREATE_LAYOUT.MIN_QUESTION_AREA,
        getQuestionContentHeight(question) +
          CREATE_LAYOUT.CONTENT_PAD_TOP +
          CREATE_LAYOUT.CONTENT_PAD_BOTTOM
      );
    }
    return CREATE_LAYOUT.MIN_QUESTION_AREA;
  }

  function getChoicePanelHeight(optionCount) {
    return getQuestionAreaHeight({
      type: 'choice',
      options: { length: optionCount },
    });
  }

  function getCreateLayout(question) {
    if (question.createLayout) return question.createLayout;

    if (question.type === 'choice') {
      const optionCount = question.options.length;
      const choiceBoxH = getChoiceContentHeight(optionCount);
      const questionAreaH = getQuestionAreaHeight(question);
      return {
        questionAreaH: questionAreaH,
        stackH: CREATE_LAYOUT.AMULET_AREA + questionAreaH,
        choiceBoxH: choiceBoxH,
        boxH: choiceBoxH,
        choice: true,
        optionCount: optionCount,
      };
    }

    if (question.type === 'text') {
      const questionAreaH = getQuestionAreaHeight(question);
      return {
        questionAreaH: questionAreaH,
        stackH: CREATE_LAYOUT.AMULET_AREA + questionAreaH,
        boxH: CREATE_LAYOUT.TEXT_FIELD_H,
        compact: true,
      };
    }

    const questionAreaH = getQuestionAreaHeight(question);
    return {
      questionAreaH: questionAreaH,
      stackH: CREATE_LAYOUT.AMULET_AREA + questionAreaH,
      boxH: CREATE_LAYOUT.TEXT_FIELD_H,
    };
  }

  function applyCreateLayout(question) {
    if (isRequestFlowActive()) return;
    const layout = getCreateLayout(question);
    const stack =
      document.querySelector('.pagmar__index-create-stack') ||
      document.querySelector('.pagmar__index-create-frames') ||
      document.querySelector('.pagmar__create-stack');
    const questionBlock = document.querySelector('.pagmar__create-question-block');
    const targets = [stack, indexCreateWorkspace, questionBlock, document.body].filter(Boolean);
    const questionAreaH = layout.questionAreaH || CREATE_LAYOUT.MIN_QUESTION_AREA;
    const stackH = layout.stackH || CREATE_LAYOUT.AMULET_AREA + questionAreaH;

    targets.forEach(function (el) {
      el.style.setProperty('--create-question-area-h', String(questionAreaH));
      el.style.setProperty('--create-stack-h', String(stackH));
      el.style.setProperty(
        '--create-question-box-h',
        String(layout.choice ? layout.choiceBoxH : layout.boxH || CREATE_LAYOUT.TEXT_FIELD_H)
      );
      if (layout.choice) {
        el.style.setProperty('--create-choice-count', String(layout.optionCount || 0));
      } else {
        el.style.removeProperty('--create-choice-count');
      }
      el.classList.toggle('is-choice-question', Boolean(layout.choice));
      el.classList.toggle('is-compact-head', Boolean(layout.compact));
    });

    document.body.classList.toggle('is-choice-question', Boolean(layout.choice));

    if (isIndexCreateMode()) {
      positionIndexCreateWindow();
    }
  }

  function isIndexCreateMode() {
    return isIndexPage && document.body.classList.contains('is-create-mode');
  }

  function isRequestFlow() {
    return Boolean(document.querySelector('.pagmar__request-flow'));
  }

  let requestFogBootToken = 0;

  function bootRequestFlowFogIfNeeded() {
    if (!isRequestFlowActive()) return;
    const token = ++requestFogBootToken;
    import('./request-flow-fog.js?v=20250709-full-site')
      .then(function (mod) {
        if (token !== requestFogBootToken) return;
        return mod.bootRequestFlowFog();
      })
      .catch(function (err) {
        console.warn('[questionnaire] request fog failed', err);
      });
  }

  function stopRequestFlowFogIfNeeded() {
    requestFogBootToken += 1;
    import('./request-flow-fog.js?v=20250709-full-site')
      .then(function (mod) {
        mod.stopRequestFlowFog();
      })
      .catch(function () {});
  }

  function isRequestFlowActive() {
    return isIndexCreateMode() || (isCreatePage && isRequestFlow());
  }

  function isCreateFlow() {
    return isCreatePage || isIndexCreateMode();
  }

  function questionLineClass() {
    return 'pagmar__create-question-line';
  }

  function loadAnswers() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveAnswers(data) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function answeredCount(answers) {
    return questions.filter(function (q) {
      const v = answers[q.key];
      return v !== undefined && v !== null && String(v).trim() !== '';
    }).length;
  }

  function allAnswered(answers) {
    return answeredCount(answers) === questions.length;
  }

  function nextUnansweredIndex(answers) {
    for (let i = 0; i < questions.length; i++) {
      const v = answers[questions[i].key];
      if (v === undefined || v === null || String(v).trim() === '') return i;
    }
    return 0;
  }

  function showAmulet() {
    void showFinishedAmuletNow();
  }

  async function showFinishedAmuletNow(answers) {
    if (typeof window.amuletBuildCancel === 'function') {
      window.amuletBuildCancel();
    }
    document.body.classList.remove('is-building');

    try {
      await ensureAmuletModules();
    } catch (err) {
      console.error('[questionnaire] failed to load amulet renderer', err);
      document.body.classList.remove('is-amulet-rendering');
      if (typeof window.amuletHideLoader === 'function') {
        window.amuletHideLoader({ force: true });
      }
      alert('לא הצלחנו לטעון את מערכת הקמע. בדקי חיבור לאינטרנט ורענני.');
      return;
    }

    if (typeof window.showFinishedAmulet === 'function') {
      await window.showFinishedAmulet(answers);
      return;
    }

    try {
      const mod = await import('./amulet-show.js?v=20250711-result-amulet-scale');
      await mod.showFinishedAmulet(answers);
    } catch (err) {
      console.error('[questionnaire] failed to load amulet renderer', err);
      document.body.classList.remove('is-amulet-rendering');
      if (typeof window.amuletHideLoader === 'function') {
        window.amuletHideLoader({ force: true });
      }
      alert('לא הצלחנו לטעון את מערכת הקמע. בדקי חיבור לאינטרנט ורענני.');
    }
  }

  function isCreateFlowBusy() {
    return (
      document.body.classList.contains('is-building') ||
      document.body.classList.contains('is-amulet-rendering') ||
      document.body.classList.contains('is-amulet-ready') ||
      document.body.classList.contains('is-create-amulet-ready') ||
      document.body.classList.contains('is-result-overlay-open')
    );
  }

  function pushCreateHistory() {
    try {
      history.pushState({ pagmarView: 'create' }, '');
      createHistoryPushed = true;
    } catch (_) {}
  }

  function pushResultHistory() {
    try {
      history.pushState({ pagmarView: 'result' }, '');
      createHistoryPushed = true;
    } catch (_) {}
  }

  function stopCreateFlowEffects() {
    stopRequestFlowFogIfNeeded();
    stopCreateAmuletMorph();
    if (typeof window.amuletBuildCancel === 'function') {
      window.amuletBuildCancel();
    }
    document.body.classList.remove(
      'is-building',
      'is-amulet-rendering',
      'is-create-fullpage-loading',
      'is-amulet-ready',
      'is-create-amulet-ready',
      'is-vector-frame-loading',
      'is-question-transition-loading'
    );
    if (typeof window.amuletHideLoader === 'function') {
      window.amuletHideLoader({ force: true });
    }
  }

  function resetCreateHistoryAfterSave() {
    createHistoryPushed = false;
    window.setTimeout(function () {
      createPopstateIgnore = 2;
      try {
        history.go(-2);
      } catch (_) {
        createPopstateIgnore = 0;
        try {
          history.replaceState(null, '');
        } catch (_e) {}
      }
    }, 0);
  }

  function cancelCreateBuildIfNeeded() {
    if (
      !document.body.classList.contains('is-building') &&
      !document.body.classList.contains('is-amulet-rendering')
    ) {
      return;
    }
    if (typeof window.amuletBuildCancel === 'function') {
      window.amuletBuildCancel();
    }
    document.body.classList.remove(
      'is-building',
      'is-amulet-rendering',
      'is-amulet-ready',
      'is-create-amulet-ready'
    );
    if (typeof window.amuletHideLoader === 'function') {
      window.amuletHideLoader();
    }
  }

  function goToResult() {
    if (
      document.body.classList.contains('has-user-amulet') &&
      typeof window.gardenFocusUserAmulet === 'function' &&
      window.gardenFocusUserAmulet()
    ) {
      return;
    }
    void showFinishedAmuletNow();
  }

  function questionNumber(index) {
    return '[ ' + String(index + 1).padStart(2, '0') + ' ]';
  }

  function choiceHeading(question) {
    return CHOICE_TITLES[question.key] || question.label || question.text;
  }

  function buildProgressDots() {
    if (!progressDots || !isIndexPage) return;
    progressDots.innerHTML = '';
    questions.forEach(function (_q, i) {
      const dot = document.createElement('span');
      dot.className = 'pagmar__progress-dot';
      dot.dataset.step = String(i);
      dot.setAttribute('aria-hidden', 'true');
      progressDots.appendChild(dot);
    });
  }

  function updateStepIndicators(answers) {
    if (!isIndexPage) return;

    const next = nextUnansweredIndex(answers);
    const done = allAnswered(answers);
    const count = answeredCount(answers);
    const ratio = questions.length ? count / questions.length : 0;

    if (progressFill) {
      progressFill.style.width = (ratio * 100).toFixed(1) + '%';
    }

    if (progressDots) {
      progressDots.querySelectorAll('.pagmar__progress-dot').forEach(function (dot, i) {
        const answered =
          answers[questions[i].key] && String(answers[questions[i].key]).trim();
        dot.classList.toggle('is-answered', Boolean(answered));
        dot.classList.toggle('is-current', i === next && !done);
      });
    }
  }

  function validate(question, value) {
    return Boolean(value && String(value).trim());
  }

  function setBuilding(isBuilding) {
    if (!isCreateFlow()) return;
    if (isBuilding && document.body.classList.contains('is-semantic-questions')) {
      isBuilding = false;
    }
    document.body.classList.toggle('is-building', Boolean(isBuilding));
    const zone = document.querySelector(
      isRequestFlowActive()
        ? '.pagmar__request-amulet-build'
        : isIndexCreateMode()
          ? '.pagmar__index-create-amulet-frame'
          : '.pagmar__create-amulet-frame'
    );
    if (zone) zone.classList.toggle('is-building', Boolean(isBuilding));
  }

  async function runAmuletBuild(answers, options) {
    if (!isCreateFlow()) return;
    const opts = options || {};
    const uiBlocking = opts.uiBlocking !== false;
    const showLoader = opts.showLoader !== false;
    try {
      await ensureAmuletModules();
    } catch (err) {
      console.error('[questionnaire] failed to load amulet build', err);
      return;
    }
    if (typeof window.amuletBuildUpdate !== 'function') return;
    if (uiBlocking) setBuilding(true);
    try {
      await window.amuletBuildUpdate(answers, {
        uiBlocking: uiBlocking,
        showLoader: showLoader,
      });
    } finally {
      if (uiBlocking) setBuilding(false);
    }
  }

  function unlockSemanticQuestionUi() {
    setBuilding(false);
  }

  window.amuletUnlockSemanticQuestionUi = unlockSemanticQuestionUi;

  /** Q4-Q7: vectors already visible - only warm PBR compose when browser is idle. */
  function schedulePostVectorPrecompose(answers, answeredIndex) {
    if (answeredIndex < 3 || answeredIndex > 6) return;
    if (typeof window.amuletSchedulePrecompose === 'function') {
      window.amuletSchedulePrecompose(answers);
      return;
    }
    void ensureAmuletModules()
      .then(function () {
        if (typeof window.amuletSchedulePrecompose === 'function') {
          window.amuletSchedulePrecompose(answers);
        }
      })
      .catch(function (err) {
        console.error('[questionnaire] failed to schedule precompose', err);
      });
  }

  function keepIndexCreateOpen() {
    if (!isIndexCreateMode() || !indexCreateWorkspace) return;
    window.clearTimeout(indexCreateExitTimer);
    indexCreateExitTimer = null;
    if (!indexCreateWorkspace.classList.contains('is-open')) {
      indexCreateWorkspace.classList.add('is-open');
    }
  }

  function getCreateInputValue() {
    if (!fieldWrap) return '';
    if (fieldWrap.dataset.choiceValue) return fieldWrap.dataset.choiceValue;
    const el = fieldWrap.querySelector('.intro__question-input');
    return el && 'value' in el ? el.value.trim() : '';
  }


  function ensureQuestionInteractive() {
    document.body.classList.remove('is-question-transition-loading', 'is-vector-frame-loading');
    if (requestArtboard) requestArtboard.classList.remove('is-advancing');
    setBuilding(false);
    unlockSemanticQuestionUi();
    if (typeof window.amuletClearBuildUi === 'function') {
      window.amuletClearBuildUi();
    }
  }

  function hideQuestionForAdvance() {
    document.body.classList.add('is-question-transition-loading');
    if (requestArtboard) requestArtboard.classList.add('is-advancing');
    hideVectorTip();
    hideAmuletStageCaption();
  }

  function waitForNextVectorReady(timeoutMs) {
    const maxMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    return new Promise(function (resolve) {
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        window.removeEventListener('questionnaire:vector-ready', onReady);
        resolve();
      }
      const timer = window.setTimeout(finish, maxMs);
      function onReady() {
        window.clearTimeout(timer);
        finish();
      }
      window.addEventListener('questionnaire:vector-ready', onReady);
    });
  }

  function waitQuestionTransitionMin(startedAt) {
    const elapsed = performance.now() - startedAt;
    const remaining = REQUEST_TRANSITION_MS - elapsed;
    if (remaining <= 0) return Promise.resolve();
    return placeholderSleep(remaining);
  }

  function revealQuestionAfterAdvance(nextIndex) {
    ensureQuestionInteractive();
    if (nextIndex >= 3) {
      document.body.classList.add('is-semantic-questions');
    }
    populateCreateQuestion(nextIndex);
    ensureQuestionInteractive();
    const question = questions[nextIndex];
    if (!question || !fieldWrap) return;
    if (question.type === 'choice') return;
    requestAnimationFrame(function () {
      const input = fieldWrap.querySelector('.intro__question-input');
      if (input && typeof input.focus === 'function') {
        input.focus({ preventScroll: true });
      }
    });
  }

  function hideFinalBuildQuestionChrome() {
    if (!isCreateFlow()) return;
    const copy = document.getElementById('questionCopyFrame');
    const title = document.getElementById('questionText');
    const desc = document.getElementById('questionDesc');
    const tag = document.getElementById('questionTag');
    const dock = document.querySelector('.figma-q__dock');
    const about = document.getElementById('requestAboutBtn');
    const vectorCopy = document.getElementById('questionVectorCopy');

    if (title) title.textContent = '';
    if (desc) {
      desc.textContent = '';
      desc.hidden = true;
    }
    if (tag) tag.hidden = true;
    if (copy) copy.hidden = true;
    if (dock) dock.hidden = true;
    if (about) about.hidden = true;
    if (vectorCopy) vectorCopy.hidden = true;
    if (amuletStageCaptionEl) {
      amuletStageCaptionEl.textContent = '';
      amuletStageCaptionEl.hidden = true;
    }
    if (requestArtboard) {
      requestArtboard.classList.remove('is-advancing');
      requestArtboard.style.removeProperty('--figma-amulet-caption-top');
    }
    document.body.classList.remove('is-question-transition-loading');
  }

  function saveAnswer(index, value) {
    const question = questions[index];
    if (!question) return;
    if (document.body.classList.contains('is-question-transition-loading')) return;

    keepIndexCreateOpen();

    if (isCreateFlow() && typeof window.gardenCapturePlacementAnchor === 'function') {
      window.gardenCapturePlacementAnchor();
    }

    const answers = loadAnswers();
    answers[question.key] = value;
    saveAnswers(answers);
    updateStepIndicators(answers);

    window.dispatchEvent(
      new CustomEvent('questionnaire:answered', { detail: { index: index } })
    );

    if (isCreateFlow()) {
      void (async function () {
        if (question.type !== 'choice' && !isIndexCreateMode()) closePanel();
        if (allAnswered(answers)) {
          answers.completedAt = Date.now();
          saveAnswers(answers);
          closePanel();
          hideFinalBuildQuestionChrome();
          mountAmuletInCreateSlot();
          document.body.classList.add('is-amulet-rendering');
          await runAmuletBuild(answers, { showLoader: false, uiBlocking: false });
          await showFinishedAmuletNow(answers);
          return;
        }
        const nextIndex = nextUnansweredIndex(answers);

        mountAmuletInCreateSlot();

        if (nextIndex >= 3) {
          document.body.classList.add('is-semantic-questions');
        }

        async function buildVectorIfNeeded(allowUiBlock) {
          try {
            await ensureAmuletModules();
          } catch (err) {
            console.error('[questionnaire] failed to load amulet build', err);
            return;
          }

          const willShowNewLayer =
            typeof window.amuletWillShowNewVectorLayer === 'function' &&
            window.amuletWillShowNewVectorLayer(answers);
          const needsCatchup =
            typeof window.amuletNeedsVectorCatchup === 'function' &&
            window.amuletNeedsVectorCatchup(answers);

          if (!willShowNewLayer) {
            if (needsCatchup) {
              await runAmuletBuild(answers, {
                uiBlocking: allowUiBlock !== false,
                showLoader: false,
              });
            }
            return;
          }

          await runAmuletBuild(answers, {
            uiBlocking: allowUiBlock !== false,
            showLoader: allowUiBlock !== false,
          });
        }

        function transitionNeedsChoiceThumbSync(answeredIndex, data) {
          return Boolean(
            (answeredIndex === 3 && data.q4Belief) ||
              (answeredIndex === 4 && data.q5Feeling)
          );
        }

        async function transitionNeedsVectorBuild(data) {
          try {
            await ensureAmuletModules();
          } catch (_err) {
            return false;
          }
          const willShowNewLayer =
            typeof window.amuletWillShowNewVectorLayer === 'function' &&
            window.amuletWillShowNewVectorLayer(data);
          const needsCatchup =
            typeof window.amuletNeedsVectorCatchup === 'function' &&
            window.amuletNeedsVectorCatchup(data);
          return Boolean(willShowNewLayer || needsCatchup);
        }

        async function prepareNextQuestionScreen(answeredIndex, data) {
          const needsVectorBuild = await transitionNeedsVectorBuild(data);
          if (needsVectorBuild) {
            if (isRequestFlowActive()) hideQuestionForAdvance();
            const vectorDone = waitForNextVectorReady();
            await buildVectorIfNeeded(false);
            await vectorDone;
            await waitNextPaint();
          }

          if (transitionNeedsChoiceThumbSync(answeredIndex, data)) {
            await syncChoicePresetVectorsFromAnswers(data);
          }
        }

        try {
          await prepareNextQuestionScreen(index, answers);
        } catch (err) {
          console.error('[questionnaire] question transition prepare failed', err);
        }
        revealQuestionAfterAdvance(nextIndex);

        if (index >= 3 && index <= 6) {
          schedulePostVectorPrecompose(answers, index);
        }
      })();
      return;
    }

    closePanel();

    if (allAnswered(answers)) {
      answers.completedAt = Date.now();
      saveAnswers(answers);
      window.setTimeout(goToResult, 480);
      return;
    }

    window.setTimeout(function () {
      openModal(nextUnansweredIndex(answers));
    }, PANEL_MS);
  }

  function questionHasChoiceDividers(question) {
    return Boolean(question && question.choiceDividers);
  }

  function appendChoiceDivider(parent) {
    const divider = document.createElement('div');
    divider.className = 'intro__choice-divider';
    divider.setAttribute('role', 'presentation');
    divider.setAttribute('aria-hidden', 'true');
    parent.appendChild(divider);
    return divider;
  }

  function appendChoiceOption(parent, opt, selectedValue, bindChoiceButton) {
    const btn = createChoiceButton(opt, selectedValue);
    bindChoiceButton(btn, opt);
    parent.appendChild(btn);
    return btn;
  }

  function createChoiceButton(opt, selectedValue) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'intro__choice-btn intro__choice-btn--figma' +
      (selectedValue === opt.value ? ' is-selected' : '') +
      (opt.fitWidth ? ' is-fit-width' : '');
    btn.dataset.value = opt.value;

    const label = document.createElement('span');
    label.className = 'intro__choice-btn__label';
    label.textContent = opt.label;

    const radio = document.createElement('span');
    radio.className = 'intro__choice-btn__radio';
    radio.setAttribute('aria-hidden', 'true');

    btn.appendChild(label);
    btn.appendChild(radio);
    return btn;
  }

  function renderCreateField(question, answers, index) {
    fieldWrap.innerHTML = '';
    delete fieldWrap.dataset.choiceValue;
    const value = answers[question.key] || '';
    const useDockChoiceGrid =
      question.type === 'choice' && isRequestFlowActive();
    const hideChoiceSubmit = false;

    if (question.type === 'choice') {
      if (submitBtn) submitBtn.hidden = hideChoiceSubmit;
      if (saveWrap) saveWrap.hidden = hideChoiceSubmit;

      let selectedValue = value;
      if (useDockChoiceGrid && selectedValue) {
        fieldWrap.dataset.choiceValue = selectedValue;
      }

      const grid = document.createElement('div');
      grid.className = 'intro__choice-grid intro__choice-grid--figma';
      grid.dataset.choiceCount = String(question.options.length);
      const useChoiceDividers = questionHasChoiceDividers(question);

      if (useDockChoiceGrid) {
        grid.classList.add('intro__choice-grid--dock');
      }
      if (useChoiceDividers) {
        grid.classList.add('intro__choice-grid--divided');
      }

      function bindChoiceButton(btn, opt) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (document.body.classList.contains('is-question-transition-loading')) return;
          saveAnswer(index, opt.value);
        });
      }

      if (useDockChoiceGrid) {
        question.options.forEach(function (opt, optIndex) {
          if (useChoiceDividers && optIndex > 0) {
            appendChoiceDivider(grid);
          }
          appendChoiceOption(grid, opt, selectedValue, bindChoiceButton);
        });
      } else {
        const rowPlan = getChoiceRowIndices(question.options.length, false);
        rowPlan.forEach(function (indices) {
          const row = document.createElement('div');
          row.className = 'intro__choice-grid-row';
          if (indices.length < 3) {
            row.classList.add('intro__choice-grid-row--partial');
          }
          indices.forEach(function (optIndex) {
            const opt = question.options[optIndex];
            const btn = createChoiceButton(opt, selectedValue);
            bindChoiceButton(btn, opt);
            row.appendChild(btn);
          });
          grid.appendChild(row);
        });
      }
      fieldWrap.appendChild(grid);
      return null;
    }

    submitBtn.hidden = false;
    if (saveWrap) saveWrap.hidden = false;

    if (question.type === 'text' || question.type === 'textarea') {
      const el = document.createElement('input');
      el.type = 'text';
      el.className = 'intro__question-input intro__question-input--single';
      el.placeholder = '';
      el.value = value;
      fieldWrap.appendChild(el);
      return el;
    }
  }

  function applyRequestQuestionLayout(question) {
    if (requestActiveCard) {
      requestActiveCard.classList.toggle(
        'is-title-offset-slot',
        Boolean(question.figmaTitleOffset)
      );
    }
    if (textEl) {
      textEl.classList.toggle('is-title-offset', Boolean(question.figmaTitleOffset));
    }
  }

  function syncRequestQuestionTextLayout() {
    if (!isRequestFlowActive() || !requestArtboard) return;
    requestArtboard.style.removeProperty('--figma-q-desc-top');
  }

  function getAnsweredVectorStage() {
    const answers = loadAnswers();
    if (!answers.q1Wish || !String(answers.q1Wish).trim()) return 0;
    if (!answers.q2Name || !String(answers.q2Name).trim()) return 1;
    if (!answers.q3WhyNow || !String(answers.q3WhyNow).trim()) return 2;
    return 3;
  }

  async function syncChoicePresetVectorsFromAnswers(answers) {
    if (!isRequestFlowActive()) return;
    const data = answers || loadAnswers();
    const mod = await import('./choice-preset-vectors.js?v=20250709-choice-vectors');
    await mod.syncChoicePresetThumbVectors(data);
  }

  function hideVectorTip() {
    if (vectorCopyEl) vectorCopyEl.hidden = true;
  }

  function hideAmuletStageCaption() {
    if (!amuletStageCaptionEl) return;
    amuletStageCaptionEl.textContent = '';
    amuletStageCaptionEl.hidden = true;
    if (requestArtboard) {
      requestArtboard.style.removeProperty('--figma-amulet-caption-top');
    }
  }

  function syncVectorCopy(_explicitStage, questionIndex) {
    if (!isRequestFlowActive()) return;
    const qIndex = typeof questionIndex === 'number' ? questionIndex : activeIndex;

    hideAmuletStageCaption();

    if (!vectorCopyEl) return;

    const live = requestArtboard && requestArtboard.classList.contains('is-amulet-live');
    const caption =
      live &&
      qIndex !== null &&
      qIndex >= 1 &&
      qIndex <= LAST_EXPLAINED_QUESTION_INDEX
        ? getPastStageCaptionText(qIndex)
        : '';

    if (!caption) {
      hideVectorTip();
      return;
    }

    if (vectorCopyTextEl) {
      vectorCopyTextEl.textContent = caption;
    }
    vectorCopyEl.hidden = false;

    const surface = vectorCopyEl.querySelector('.pagmar__garden-amulet-hover__surface');
    if (window.pagmarGlassLens && surface) {
      window.pagmarGlassLens.register(surface);
    }
  }

  function syncAmuletStageCaption() {
    hideAmuletStageCaption();
  }

  function setCreateQuestionText(question, index) {
    const stepNum =
      typeof index === 'number' ? index + 1 : activeIndex !== null ? activeIndex + 1 : 1;
    const category = question.tag || '[בקשה]';
    if (tagStepEl) tagStepEl.textContent = stepNum + '/8';
    if (tagCategoryEl) tagCategoryEl.textContent = category;
    if (tagEl && !tagStepEl && !tagCategoryEl) {
      tagEl.textContent = stepNum + '/8 ' + category;
    }
    applyRequestQuestionLayout(question);
    if (textEl) {
      textEl.classList.toggle('is-title-offset', Boolean(question.figmaTitleOffset));
    }
    if (!textEl) return;
    textEl.textContent = question.text;
    if (descEl) {
      if (question.description) {
        descEl.textContent = window.pagmarNormalizeDashes
          ? window.pagmarNormalizeDashes(question.description)
          : question.description;
        descEl.hidden = false;
      } else {
        descEl.textContent = '';
        descEl.hidden = true;
      }
    }
    requestAnimationFrame(function () {
      syncRequestQuestionTextLayout();
    });
  }

  function ensureCreateSaveVisible(question, index) {
    if (typeof window.restoreCreateQuestionInput === 'function') {
      window.restoreCreateQuestionInput();
    }
    document.body.classList.remove('is-create-complete', 'is-create-amulet-ready');
    const workspace = document.getElementById('indexCreateWorkspace');
    if (workspace) {
      workspace.classList.remove('is-create-complete');
    }
    const hideDockChoiceSubmit = false;
    const saveWrapEl =
      document.getElementById('questionSubmitWrap') ||
      document.querySelector('.figma-q__btn-outer, .pagmar__create-save-wrap');
    const submitEl = document.getElementById('questionSubmit');
    const questionBox = document.querySelector('.figma-q__field-box, .pagmar__create-question-box');
    if (questionBox) {
      questionBox.hidden = false;
      questionBox.style.removeProperty('display');
    }
    if (saveWrapEl) {
      saveWrapEl.hidden = hideDockChoiceSubmit;
      if (!hideDockChoiceSubmit) {
        saveWrapEl.style.removeProperty('display');
      }
    }
    if (submitEl) {
      submitEl.hidden = hideDockChoiceSubmit;
      if (!hideDockChoiceSubmit) {
        submitEl.hidden = false;
      }
    }
  }

  function populateCreateQuestion(index) {
    const question = questions[index];
    if (!question || !frame) return;

    ensureQuestionInteractive();
    resetDockAmuletLift();

    if (index >= 3) {
      unlockSemanticQuestionUi();
    }

    const isDockChoiceQuestion =
      question.type === 'choice' && isRequestFlowActive();
    const isChoiceSaveQuestion = isDockChoiceQuestion;

    ensureCreateSaveVisible(question, index);

    if (typeof window.gardenCapturePlacementAnchor === 'function') {
      window.gardenCapturePlacementAnchor();
    }

    applyCreateLayout(question);

    document.body.classList.toggle('is-choice-question', isDockChoiceQuestion);
    document.body.classList.toggle('is-choice-save', isChoiceSaveQuestion);
    document.body.classList.toggle('is-semantic-questions', index >= 3);
    if (indexCreateWorkspace) {
      indexCreateWorkspace.classList.toggle('is-choice-question', isDockChoiceQuestion);
      indexCreateWorkspace.classList.toggle('is-choice-save', isChoiceSaveQuestion);
    }
    if (requestArtboard) {
      requestArtboard.classList.toggle('is-choice-question', isDockChoiceQuestion);
      requestArtboard.classList.toggle('is-choice-save', isChoiceSaveQuestion);
    }

    const answers = loadAnswers();
    if (labelEl) labelEl.textContent = questionNumber(index);
    setCreateQuestionText(question, index);
    updateRequestProgress(index);

    const fieldEl = renderCreateField(question, answers, index);
    setCreateSaveLabel(index);
    syncVectorCopy(getAnsweredVectorStage(), index);
    syncChoicePresetVectorsFromAnswers(answers);

    if (fieldEl) {
      startPlaceholderCycle(fieldEl, question);
      submitBtn.disabled = !validate(question, fieldEl.value.trim());
      fieldEl.addEventListener('input', function () {
        submitBtn.disabled = !validate(question, fieldEl.value.trim());
      });
    } else {
      stopPlaceholderCycle();
      if (question.type === 'choice' && isRequestFlowActive()) {
        submitBtn.disabled = !validate(question, getCreateInputValue());
      } else {
        submitBtn.disabled = true;
      }
    }

    frame.hidden = false;
    activeIndex = index;
    document.body.classList.add('is-panel-open');
    window.dispatchEvent(new CustomEvent('questionnaire:panel-open'));
    bindFigmaSubmitButtonHover();

    ensureDockLiftObserver();
    requestAnimationFrame(function () {
      syncDockAmuletLift();
      syncRequestQuestionTextLayout();
      ensureQuestionInteractive();
    });

    requestAnimationFrame(function () {
      if (!fieldEl) return;
      if (isRequestFlowActive() && (question.type === 'text' || question.type === 'textarea')) {
        fieldEl.focus({ preventScroll: true });
        return;
      }
      if (fieldEl.value.trim()) {
        fieldEl.focus({ preventScroll: true });
        return;
      }
      if (!usesDockPlaceholderCycle(question)) {
        fieldEl.focus({ preventScroll: true });
      }
    });
  }

  function openCreatePanel(index) {
    const question = questions[index];
    if (!question || !frame) return;

    const isTransition =
      isRequestFlowActive() && activeIndex !== null && activeIndex !== index;

    if (isTransition) {
      animateRequestQuestionChange(function () {
        populateCreateQuestion(index);
      });
      return;
    }

    populateCreateQuestion(index);
  }

  function renderTextField(question, answers) {
    textField.innerHTML = '';
    const value = answers[question.key] || '';

    if (question.type === 'textarea') {
      const el = document.createElement('textarea');
      el.className = 'pagmar__text-input';
      el.rows = 4;
      el.placeholder = question.placeholder || '';
      el.value = value;
      textField.appendChild(el);
      return el;
    }

    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'pagmar__text-input pagmar__text-input--single';
    el.placeholder = question.placeholder || '';
    el.value = value;
    textField.appendChild(el);
    return el;
  }

  function openChoicePanel(index) {
    const question = questions[index];
    if (!question || question.type !== 'choice' || !choicePanel) return;

    const answers = loadAnswers();
    const current = answers[question.key] || '';

    choiceTitle.textContent = choiceHeading(question);
    choiceQuestion.textContent = question.text;
    choiceOptions.innerHTML = '';

    const useChoiceDividers = questionHasChoiceDividers(question);
    question.options.forEach(function (opt, optIndex) {
      if (useChoiceDividers && optIndex > 0) {
        appendChoiceDivider(choiceOptions);
      }
      const btn = createChoiceButton(opt, current);
      btn.classList.add('pagmar__choice-pill');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        saveAnswer(index, opt.value);
      });
      choiceOptions.appendChild(btn);
    });

    choicePanel.hidden = false;
    requestAnimationFrame(function () {
      choicePanel.classList.add('is-open');
    });
  }

  function openTextPanel(index) {
    const question = questions[index];
    if (!question || !textPanel) return;

    const answers = loadAnswers();
    textLabel.textContent = questionNumber(index);
    textQuestion.textContent = question.text;

    const fieldEl = renderTextField(question, answers);
    textSubmit.disabled = !validate(question, fieldEl.value.trim());

    fieldEl.addEventListener('input', function () {
      textSubmit.disabled = !validate(question, fieldEl.value.trim());
    });

    textSubmit.onclick = function () {
      const value = fieldEl.value.trim();
      if (!validate(question, value)) return;
      saveAnswer(index, value);
    };

    textPanel.hidden = false;
    requestAnimationFrame(function () {
      textPanel.classList.add('is-open');
      fieldEl.focus();
    });
  }

  function resolveSpecAnchor(index, anchor) {
    if (anchor && (anchor.clientX != null || anchor.x != null)) return anchor;
    const questions = window.AMULET_QUESTIONS || [];
    if (index >= questions.length && typeof window.gardenAnchorForUserAmulet === 'function') {
      var collectionIndex = index - questions.length;
      return window.gardenAnchorForUserAmulet(collectionIndex);
    }
    return anchor || null;
  }

  let activeSpecAnchorTex = null;

  function positionSpecPanel(anchor) {
    if (!specPanel || !anchor) return;

    const margin = 16;
    const overlap = 0.4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rtl = document.documentElement.dir === 'rtl';
    const pagmar = document.querySelector('.pagmar-canvas');
    const pagmarRect = pagmar ? pagmar.getBoundingClientRect() : { left: 0, top: 0 };

    const cx =
      anchor.clientX != null
        ? anchor.clientX
        : pagmarRect.left + (anchor.x || 0);
    const cy =
      anchor.clientY != null
        ? anchor.clientY
        : pagmarRect.top + (anchor.y || 0);
    const visualHalfW = anchor.visualHalfW || (anchor.halfW != null ? anchor.halfW * 0.76 : 72);
    const visualHalfH = anchor.visualHalfH || (anchor.halfH != null ? anchor.halfH * 0.76 : visualHalfW);

    specPanel.classList.remove('is-anchored');
    specPanel.style.position = 'fixed';
    specPanel.style.left = '';
    specPanel.style.top = '';
    specPanel.style.right = '';
    specPanel.style.bottom = '';

    const panelRect = specPanel.getBoundingClientRect();
    const panelW = panelRect.width || specPanel.offsetWidth || 115;
    const panelH = panelRect.height || specPanel.offsetHeight || 35;

    const amuletLeft = cx - visualHalfW;
    const amuletRight = cx + visualHalfW;
    const amuletTop = cy - visualHalfH;
    const amuletBottom = cy + visualHalfH;

    const spaceRight = vw - amuletRight - margin;
    const spaceLeft = amuletLeft - margin;
    let left;

    function placeOnPhysicalLeft() {
      left = amuletLeft - panelW * (1 - overlap);
    }
    function placeOnPhysicalRight() {
      left = amuletRight - panelW * overlap;
    }

    if (rtl) {
      if (spaceLeft >= panelW * (1 - overlap)) placeOnPhysicalLeft();
      else if (spaceRight >= panelW * (1 - overlap)) placeOnPhysicalRight();
      else placeOnPhysicalLeft();
    } else {
      if (spaceRight >= panelW * (1 - overlap)) placeOnPhysicalRight();
      else if (spaceLeft >= panelW * (1 - overlap)) placeOnPhysicalLeft();
      else placeOnPhysicalRight();
    }

    let top = cy - panelH * 0.35;
    top = Math.max(amuletTop - margin * 0.2, Math.min(amuletBottom - panelH * 0.72, top));
    top = Math.max(margin, Math.min(vh - panelH - margin, top));
    left = Math.max(margin, Math.min(vw - panelW - margin, left));

    /* Figma Frame 265 - label anchored to physical left of amulet */
    left = amuletLeft - panelW * 0.92;
    top = amuletTop + visualHalfH * 0.15;
    left = Math.max(margin, Math.min(vw - panelW - margin, left));
    top = Math.max(margin, Math.min(vh - panelH - margin, top));

    specPanel.style.left = left + 'px';
    specPanel.style.top = top + 'px';
    specPanel.style.right = 'auto';
    specPanel.style.bottom = 'auto';
    specPanel.classList.add('is-anchored');
  }

  function resetSpecPanelPosition() {
    if (!specPanel) return;
    specPanel.style.position = '';
    specPanel.style.left = '';
    specPanel.style.top = '';
    specPanel.style.right = '';
    specPanel.style.bottom = '';
    specPanel.classList.remove('is-anchored');
    activeSpecAnchorTex = null;
  }

  function specIndexLabel(index) {
    return String(index + 1).padStart(3, '0');
  }

  function plainWishText(wish) {
    const raw = window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(wish) : wish;
    const trimmed = (raw || '').trim();
    if (!trimmed || trimmed === '-') return '-';
    return trimmed.replace(/^[\u05F4"\u201C]+|[\u05F4"\u201D]+$/g, '').trim() || trimmed;
  }

  function fillSpecPanelContent(spec, index) {
    const num = specIndexLabel(index);
    const wish = plainWishText(spec.wish);
    if (specIndex) specIndex.textContent = num + ' | ' + wish;
  }

  function openAmuletSpecPanel(index, anchor, recordOverride) {
    if (!isIndexPage || !specPanel || typeof window.getAmuletSpec !== 'function') return;

    const answers = loadAnswers();
    const spec = window.getAmuletSpec(index, answers, recordOverride);
    fillSpecPanelContent(spec, index);

    activeSpecIndex = index;
    activeSpecAnchorTex = index;
    activeIndex = null;

    const resolvedAnchor = resolveSpecAnchor(index, anchor);

    if (window.questionnaireStar) {
      window.questionnaireStar.pauseFloat();
    }

    document.body.classList.add('is-panel-open', 'is-spec-panel-open');
    window.dispatchEvent(new CustomEvent('questionnaire:panel-open'));

    specPanel.hidden = false;
    requestAnimationFrame(function () {
      positionSpecPanel(resolveSpecAnchor(index, resolvedAnchor));
      specPanel.classList.add('is-open');
      requestAnimationFrame(function () {
        positionSpecPanel(resolveSpecAnchor(index, null));
      });
    });
  }

  function openPanel(index) {
    const question = questions[index];
    if (!question) return;

    if (window.questionnaireStar) {
      window.questionnaireStar.pauseFloat();
    }

    if (isCreateFlow()) {
      openCreatePanel(index);
      return;
    }

    activeIndex = index;
    document.body.classList.add('is-panel-open');
    window.dispatchEvent(new CustomEvent('questionnaire:panel-open'));

    if (isIndexPage) {
      if (question.type === 'choice') {
        openChoicePanel(index);
      } else {
        openTextPanel(index);
      }
      return;
    }

    /* legacy dark Pagmar panel (result / other pages) */
    if (!frame) return;

    labelEl.textContent = questionNumber(index);
    textEl.textContent = question.text;
    fieldWrap.innerHTML = '';
    const answers = loadAnswers();
    const value = answers[question.key] || '';

    if (question.type === 'textarea') {
      const el = document.createElement('textarea');
      el.className = 'intro__question-input';
      el.rows = 3;
      el.placeholder = question.placeholder || '';
      el.value = value;
      fieldWrap.appendChild(el);
    } else if (question.type === 'text') {
      const el = document.createElement('input');
      el.type = 'text';
      el.className = 'intro__question-input intro__question-input--single';
      el.placeholder = question.placeholder || '';
      el.value = value;
      fieldWrap.appendChild(el);
    }

    submitBtn.disabled = !validate(question, value);
    frame.hidden = false;
    frame.classList.remove('is-open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        frame.classList.add('is-open');
      });
    });
  }

  function isSpecPanelOpen() {
    return document.body.classList.contains('is-spec-panel-open');
  }

  function handleSpecPanelBackdropPointer(evt) {
    if (!isSpecPanelOpen()) return;

    const path = typeof evt.composedPath === 'function' ? evt.composedPath() : [evt.target];
    const insidePanel = path.some(function (node) {
      return node instanceof Node && specPanel && specPanel.contains(node);
    });
    if (insidePanel) return;

    const insideGarden = path.some(function (node) {
      return node instanceof Node && questionGarden && questionGarden.contains(node);
    });
    if (insideGarden) return;

    closePanel();
  }

  function closePanel() {
    stopPlaceholderCycle();
    if (isCreateFlow()) {
      if (!isIndexCreateMode()) {
        activeIndex = null;
      }
      document.body.classList.remove('is-panel-open', 'is-spec-panel-open');
      window.dispatchEvent(new CustomEvent('questionnaire:panel-close'));
      return;
    }

    document.body.classList.remove('is-panel-open', 'is-spec-panel-open');
    window.dispatchEvent(new CustomEvent('questionnaire:panel-close'));
    activeIndex = null;
    activeSpecIndex = null;

    if (choicePanel) {
      choicePanel.classList.remove('is-open');
    }
    if (textPanel) {
      textPanel.classList.remove('is-open');
    }
    if (specPanel) {
      specPanel.classList.remove('is-open');
    }
    if (frame) {
      frame.classList.remove('is-open');
    }

    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(function () {
      if (choicePanel) choicePanel.hidden = true;
      if (textPanel) textPanel.hidden = true;
      if (specPanel) {
        specPanel.hidden = true;
        resetSpecPanelPosition();
      }
      if (frame) frame.hidden = true;
      if (window.questionnaireStar) {
        window.questionnaireStar.resumeFloat();
      }
    }, PANEL_MS);
  }

  function openModal(index) {
    openPanel(index);
  }

  function mountAmuletInCreateSlot() {
    const container = document.getElementById('amuletContainer');
    if (!container || !createAmuletSlot) return;
    createAmuletSlot.appendChild(container);
    container.hidden = false;
  }

  function positionIndexCreateWindow() {
    /* מיקום מרכזי דרך CSS - רק מעדכן גובה דינמי לשאלות בחירה */
    if (!indexCreateWorkspace) return;
    indexCreateWorkspace.style.removeProperty('--index-create-x');
    indexCreateWorkspace.style.removeProperty('--index-create-y');
  }

  function restoreAmuletToStage() {
    const container = document.getElementById('amuletContainer');
    if (!container || !amuletStageParent) return;
    if (container.parentElement !== amuletStageParent) {
      amuletStageParent.appendChild(container);
    }
    container.hidden = true;
  }

  function finishExitIndexCreateFlow() {
    if (!indexCreateWorkspace) return;

    activeIndex = null;
    window.clearTimeout(requestTransitionTimer);
    requestTransitionTimer = null;

    indexCreateWorkspace.hidden = true;
    indexCreateWorkspace.classList.remove('is-create-complete');
    if (requestArtboard) {
      requestArtboard.classList.remove('is-choice-question', 'is-choice-save');
    }
    if (typeof window.restoreCreateQuestionInput === 'function') {
      window.restoreCreateQuestionInput();
    }
    document.body.classList.remove(
      'is-create-exiting',
      'is-create-mode',
      'is-panel-open',
      'is-building',
      'is-vector-frame-loading',
      'is-question-transition-loading',
      'is-amulet-ready',
      'is-create-amulet-ready',
      'is-amulet-rendering',
      'is-choice-question',
      'is-choice-save',
      'is-semantic-questions',
      'is-result-overlay-open'
    );
    var resultOverlay = document.getElementById('resultOverlay');
    if (resultOverlay) {
      resultOverlay.classList.remove('is-visible');
      resultOverlay.hidden = true;
    }
    window.dispatchEvent(new CustomEvent('questionnaire:create-close'));

    stopRequestFlowFogIfNeeded();
    stopCreateAmuletMorph();
    stopDockLiftObserver();
    hideVectorTip();
    restoreAmuletToStage();

    const status = document.getElementById('amuletStatus');
    if (status) status.hidden = true;
    const createStatus = document.getElementById('createAmuletStatus');
    if (createStatus) createStatus.hidden = true;
    if (typeof window.amuletHideLoader === 'function') {
      window.amuletHideLoader();
    }

    const garden = document.getElementById('questionGarden');
    if (garden) garden.hidden = false;

    const answers = loadAnswers();
    const completed =
      allAnswered(answers) || document.body.classList.contains('has-user-amulet');
    const hasSavedAmulet =
      (typeof window.gardenHasUserAmuletSnapshot === 'function' &&
        window.gardenHasUserAmuletSnapshot()) ||
      Boolean(sessionStorage.getItem('amuletUserSnapshot') || localStorage.getItem('amuletUserSnapshot')) ||
      hasAmuletCollection();

    if (!completed && !hasSavedAmulet) {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('amuletUserPlacementAnchor');
      updateStepIndicators({});
    } else {
      updateStepIndicators(loadAnswers());
    }

    if (window.questionnaireStar) {
      window.questionnaireStar.resumeFloat();
    }

    indexCreateExitTimer = null;
    createHistoryPushed = false;
  }

  function exitIndexCreateFlow() {
    if (!isIndexCreateMode() || !indexCreateWorkspace) return;
    cancelCreateBuildIfNeeded();

    window.clearTimeout(indexCreateExitTimer);
    closePanel();
    indexCreateWorkspace.classList.remove('is-open');
    document.body.classList.add('is-create-exiting');

    indexCreateExitTimer = window.setTimeout(
      finishExitIndexCreateFlow,
      INDEX_TRANSITION_MS
    );
  }

  function restartQuestionnaireFromResult() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('amuletUserPlacementAnchor');
    sessionStorage.removeItem('amuletUserAnswers');
    sessionStorage.removeItem('amuletComposed3D');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('amuletUserAnswers');
      localStorage.removeItem('amuletComposed3D');
    } catch (_) {}

    if (typeof window.amuletBuildCancel === 'function') {
      window.amuletBuildCancel();
    }
    resetCreateAmuletPreview();
    if (typeof window.amuletInvalidateComposeCache === 'function') {
      window.amuletInvalidateComposeCache();
    }
    if (typeof window.amuletInvalidateDetailComposeCache === 'function') {
      window.amuletInvalidateDetailComposeCache();
    }

    updateStepIndicators({});

    if (isIndexPage && indexCreateWorkspace) {
      document.body.classList.add('is-create-mode');
      document.body.classList.remove(
        'is-create-exiting',
        'is-create-complete',
        'is-amulet-rendering',
        'is-result-overlay-open',
        'is-amulet-ready',
        'is-create-amulet-ready'
      );
      indexCreateWorkspace.hidden = false;
      indexCreateWorkspace.classList.remove('is-create-complete');
      indexCreateWorkspace.classList.add('is-open');
      if (requestArtboard) {
        requestArtboard.classList.remove('is-choice-question', 'is-choice-save');
      }
      if (typeof window.restoreCreateQuestionInput === 'function') {
        window.restoreCreateQuestionInput();
      }
      const questionBox = document.querySelector('.figma-q__field-box, .pagmar__create-question-box');
      const saveWrap =
        document.getElementById('questionSubmitWrap') ||
        document.getElementById('questionSubmitWrap') ||
        document.querySelector('.figma-q__btn-outer, .pagmar__create-save-wrap');
      if (questionBox) {
        questionBox.hidden = false;
        questionBox.style.removeProperty('display');
      }
      if (saveWrap) {
        saveWrap.hidden = false;
        saveWrap.style.removeProperty('display');
      }
      if (requestProgressTotal) {
        requestProgressTotal.textContent = '/ 08';
      }
      mountAmuletInCreateSlot();
      startCreateAmuletMorph();
      ensureDockLiftObserver();
      activeIndex = null;
      openModal(0);
      requestAnimationFrame(function () {
        updateRequestProgress(0);
      });
      window.dispatchEvent(new CustomEvent('questionnaire:create-open'));
      bootRequestFlowFogIfNeeded();
      return;
    }

    if (isCreatePage) {
      document.body.classList.remove(
        'is-amulet-rendering',
        'is-result-overlay-open',
        'is-create-complete',
        'is-amulet-ready',
        'is-create-amulet-ready'
      );
      const createFlow = document.getElementById('createFlow');
      if (createFlow) {
        createFlow.hidden = false;
      }
      if (requestArtboard) {
        requestArtboard.classList.remove('is-choice-question', 'is-choice-save');
      }
      if (typeof window.restoreCreateQuestionInput === 'function') {
        window.restoreCreateQuestionInput();
      }
      if (requestProgressTotal) {
        requestProgressTotal.textContent = '/ 08';
      }
      startCreateAmuletMorph();
      ensureDockLiftObserver();
      activeIndex = null;
      openModal(0);
      requestAnimationFrame(function () {
        updateRequestProgress(0);
      });
      bootRequestFlowFogIfNeeded();
    }
  }

  function startIndexCreateFlow() {
    if (!isIndexPage || !indexCreateWorkspace) return;

    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('amuletUserPlacementAnchor');
    sessionStorage.removeItem('amuletUserAnswers');
    sessionStorage.removeItem('amuletComposed3D');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('amuletUserAnswers');
      localStorage.removeItem('amuletComposed3D');
    } catch (_) {}

    if (typeof window.amuletBuildCancel === 'function') {
      window.amuletBuildCancel();
    }
    resetCreateAmuletPreview();
    if (typeof window.amuletInvalidateComposeCache === 'function') {
      window.amuletInvalidateComposeCache();
    }
    if (typeof window.amuletInvalidateDetailComposeCache === 'function') {
      window.amuletInvalidateDetailComposeCache();
    }

    updateStepIndicators({});

    if (typeof window.gardenCapturePlacementAnchor === 'function') {
      window.gardenCapturePlacementAnchor();
    }

    document.body.classList.remove('is-create-exiting', 'is-create-complete');
    document.body.classList.add('is-create-mode');
    window.dispatchEvent(new CustomEvent('questionnaire:create-open'));
    positionIndexCreateWindow();
    indexCreateWorkspace.hidden = false;
    indexCreateWorkspace.classList.remove('is-open', 'is-create-complete');
    if (typeof window.restoreCreateQuestionInput === 'function') {
      window.restoreCreateQuestionInput();
    }
    const questionBox = document.querySelector('.figma-q__field-box, .pagmar__create-question-box');
    const saveWrap =
      document.getElementById('questionSubmitWrap') ||
      document.querySelector('.figma-q__btn-outer, .pagmar__create-save-wrap');
    if (questionBox) {
      questionBox.hidden = false;
      questionBox.style.removeProperty('display');
    }
    if (saveWrap) {
      saveWrap.hidden = false;
      saveWrap.style.removeProperty('display');
    }

    if (requestProgressTotal) {
      requestProgressTotal.textContent = '/ 08';
    }

    mountAmuletInCreateSlot();
    startCreateAmuletMorph();
    ensureDockLiftObserver();

    void ensureAmuletModules()
      .then(function () {
        if (typeof window.amuletPreloadCompose === 'function') {
          void window.amuletPreloadCompose();
        }
      })
      .catch(function (err) {
        console.error('[questionnaire] failed to load create modules', err);
      });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        indexCreateWorkspace.classList.add('is-open');
        activeIndex = null;
        openModal(0);
        requestAnimationFrame(function () {
          updateRequestProgress(0);
        });
      });
    });

    pushCreateHistory();
    bootRequestFlowFogIfNeeded();
  }

  function rewindCreateHistory() {
    let steps = 0;
    const view = history.state && history.state.pagmarView;
    if (view === 'result') {
      steps = history.length > 1 ? Math.min(2, history.length - 1) : 0;
    } else if (view === 'create' || createHistoryPushed) {
      steps = history.length > 1 ? 1 : 0;
    }
    createHistoryPushed = false;
    if (steps <= 0) return;
    createPopstateIgnore += 1;
    try {
      history.go(-steps);
    } catch (_) {
      createPopstateIgnore = Math.max(0, createPopstateIgnore - 1);
    }
  }

  function exitCreatePage() {
    if (!isCreatePage) return;
    stopRequestFlowFogIfNeeded();
    sessionStorage.removeItem(STORAGE_KEY);
    const view = history.state && history.state.pagmarView;
    const canRewind =
      history.length > 1 &&
      (createHistoryPushed || view === 'create' || view === 'result');
    rewindCreateHistory();
    if (canRewind) return;
    window.location.href = 'index.html';
  }

  function handleRequestClose() {
    stopPlaceholderCycle();
    cancelCreateBuildIfNeeded();
    if (isIndexCreateMode()) {
      rewindCreateHistory();
      exitIndexCreateFlow();
      return;
    }
    if (isCreatePage) {
      exitCreatePage();
    }
  }

  if (requestCloseBtn) {
    requestCloseBtn.addEventListener('click', handleRequestClose);
  }

  if (requestAboutBtn) {
    requestAboutBtn.addEventListener('click', function () {
      if (typeof window.openAboutShell === 'function') {
        window.openAboutShell();
      }
    });
  }

  if (textClose) {
    textClose.addEventListener('click', closePanel);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      if (activeIndex === null || !frame) return;
      if (document.body.classList.contains('is-question-transition-loading')) return;
      if (document.body.classList.contains('is-building')) {
        if (typeof window.amuletBuildCancel === 'function') {
          window.amuletBuildCancel();
        }
        document.body.classList.remove('is-building');
      }
      const question = questions[activeIndex];
      const value = getCreateInputValue();
      if (!validate(question, value)) return;
      saveAnswer(activeIndex, value);
    });
  }

  if (frameStar) {
    frameStar.addEventListener('click', closePanel);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (isRequestFlowActive()) {
      handleRequestClose();
      return;
    }
    if (document.body.classList.contains('is-panel-open')) {
      closePanel();
    }
  });

  window.addEventListener('resize', function () {
    if (document.body.classList.contains('is-create-mode')) {
      positionIndexCreateWindow();
    }
    if (activeIndex !== null && isRequestFlowActive()) {
      updateRequestStepRail(activeIndex);
      syncDockAmuletLift();
      syncRequestQuestionTextLayout();
      syncAmuletStageCaptionPosition();
    }
    if (isSpecPanelOpen() && activeSpecAnchorTex != null) {
      const anchor = resolveSpecAnchor(activeSpecAnchorTex, null);
      if (anchor) positionSpecPanel(anchor);
    }
  });

  window.addEventListener('questionnaire:star-click', function (evt) {
    if (isIndexCreateMode()) return;
    const detail = evt.detail || {};
    const index = typeof detail.index === 'number' ? detail.index : 0;
    if (isSpecPanelOpen() && activeSpecIndex === index) {
      closePanel();
      return;
    }
    openAmuletSpecPanel(index, detail.anchor, detail.answers || null);
  });

  if (pagmarCanvas) {
    pagmarCanvas.addEventListener('pointerup', handleSpecPanelBackdropPointer);
  }

  window.addEventListener('questionnaire:open', function (evt) {
    const index = evt.detail && evt.detail.index;
    if (typeof index === 'number') openModal(index);
  });

  window.addEventListener('questionnaire:close-panel', closePanel);

  window.addEventListener('questionnaire:user-amulet-ready', function () {
    window.clearTimeout(indexCreateExitTimer);
    indexCreateExitTimer = null;
    const answers = loadAnswers();
    updateStepIndicators(answers);
  });

  function hasAmuletCollection() {
    try {
      var raw =
        localStorage.getItem('amuletCollection') ||
        sessionStorage.getItem('amuletCollection');
      if (!raw) return false;
      var arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length > 0;
    } catch (_) { return false; }
  }

  async function restoreResultViewIfNeeded() {
    const params = new URLSearchParams(location.search);
    const forcePreview = params.get('result') === '1';
    const sessionRestore =
      typeof window.pagmarShouldRestoreResultView === 'function' &&
      window.pagmarShouldRestoreResultView();
    const answers = loadAnswers();
    const resumeUnsavedResult =
      allAnswered(answers) &&
      Boolean(answers.completedAt) &&
      !document.body.classList.contains('has-user-amulet');
    const shouldRestore = forcePreview || sessionRestore || resumeUnsavedResult;

    if (!shouldRestore) return;
    if (!isIndexPage && !isCreatePage) return;

    let resolvedAnswers = answers;
    if (forcePreview && !allAnswered(resolvedAnswers)) {
      try {
        const mod = await import('./amulet-show.js?v=20250711-result-amulet-scale');
        resolvedAnswers = mod.DEMO_RESULT_ANSWERS;
        saveAnswers(resolvedAnswers);
      } catch (err) {
        console.warn('[questionnaire] demo result answers unavailable', err);
        return;
      }
    } else if (!allAnswered(resolvedAnswers)) {
      return;
    }

    if (isIndexPage) {
      document.body.classList.add('is-create-mode');
      if (indexCreateWorkspace) {
        indexCreateWorkspace.hidden = false;
        indexCreateWorkspace.classList.remove('is-open');
      }
      mountAmuletInCreateSlot();
    }

    document.body.classList.add('is-amulet-rendering');
    hideFinalBuildQuestionChrome();
    if (typeof window.amuletShowLoader === 'function') {
      await window.amuletShowLoader('טוען קמע', { fullscreen: true, gallery: true });
    }

    try {
      await ensureAmuletModules();

      if (typeof window.pagmarRestoreResultView === 'function') {
        await window.pagmarRestoreResultView(resolvedAnswers);
        return;
      }

      await showFinishedAmuletNow(resolvedAnswers);
    } catch (err) {
      console.error('[questionnaire] result restore failed', err);
      document.body.classList.remove('is-amulet-rendering');
      if (isIndexPage && !sessionRestore && !forcePreview) {
        document.body.classList.remove('is-create-mode');
        if (indexCreateWorkspace) indexCreateWorkspace.hidden = true;
      }
      if (typeof window.amuletHideLoader === 'function') {
        window.amuletHideLoader({ force: true });
      }
    }
  }

  function restoreCompletedSession() {
    if (isIndexPage) {
      const garden = document.getElementById('questionGarden');
      if (garden) garden.hidden = false;
      if (!document.body.classList.contains('is-create-mode')) {
        document.body.classList.remove('is-amulet-ready', 'is-create-exiting');
      }
    }

    const hasSnapshot =
      (typeof window.gardenHasUserAmuletSnapshot === 'function' &&
        window.gardenHasUserAmuletSnapshot()) ||
      Boolean(sessionStorage.getItem('amuletUserSnapshot') || localStorage.getItem('amuletUserSnapshot'));

    if (hasSnapshot || hasAmuletCollection()) {
      if (hasSnapshot) {
        const savedAnswers =
          localStorage.getItem('amuletUserAnswers') || sessionStorage.getItem('amuletUserAnswers');
        if (savedAnswers && !allAnswered(loadAnswers())) {
          sessionStorage.setItem(STORAGE_KEY, savedAnswers);
          try {
            localStorage.setItem(STORAGE_KEY, savedAnswers);
          } catch {
            /* ignore */
          }
        }
      }
      document.body.classList.add('has-user-amulet');
      updateStepIndicators(loadAnswers());
      return;
    }

    const answers = loadAnswers();
    if (!allAnswered(answers)) return;
    updateStepIndicators(answers);
  }

  function initCreatePage() {
    if (!isCreatePage) return;
    const keepSession =
      new URLSearchParams(location.search).get('result') === '1' ||
      (typeof window.pagmarShouldRestoreResultView === 'function' &&
        window.pagmarShouldRestoreResultView()) ||
      (allAnswered(loadAnswers()) && Boolean(loadAnswers().completedAt));
    if (!keepSession) {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('amuletUserAnswers');
      sessionStorage.removeItem('amuletComposed3D');
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('amuletUserAnswers');
        localStorage.removeItem('amuletComposed3D');
      } catch (_) {}
      resetCreateAmuletPreview();
    }
    if (typeof window.amuletInvalidateComposeCache === 'function') {
      window.amuletInvalidateComposeCache();
    }
    if (typeof window.amuletInvalidateDetailComposeCache === 'function') {
      window.amuletInvalidateDetailComposeCache();
    }
    updateStepIndicators({});
    if (requestProgressTotal) {
      requestProgressTotal.textContent = '/ 08';
    }
    startCreateAmuletMorph();
    ensureDockLiftObserver();
    void ensureAmuletModules().catch(function (err) {
      console.error('[questionnaire] failed to load create modules', err);
    });
    window.setTimeout(function () {
      openModal(0);
    }, 120);
    pushCreateHistory();
    bootRequestFlowFogIfNeeded();
  }

  window.addEventListener('popstate', function () {
    if (createPopstateIgnore > 0) {
      createPopstateIgnore -= 1;
      return;
    }

    const state = history.state;

    if (isCreatePage) {
      if (state && state.pagmarView === 'create') {
        createHistoryPushed = true;
        return;
      }
      createHistoryPushed = false;
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.href = 'index.html';
      return;
    }

    if (!isIndexPage) return;

    if (state && state.pagmarView === 'result') {
      createHistoryPushed = true;
      return;
    }

    if (document.body.classList.contains('is-result-overlay-open')) {
      createHistoryPushed = Boolean(state && state.pagmarView === 'create');
      if (typeof window.pagmarHideResultOverlay === 'function') {
        window.pagmarHideResultOverlay();
      }
      return;
    }

    if (state && state.pagmarView === 'create') {
      createHistoryPushed = true;
      return;
    }

    if (isIndexCreateMode()) {
      createHistoryPushed = false;
      exitIndexCreateFlow();
    }
  });

  window.addEventListener('questionnaire:vector-ready', function (evt) {
    const stage = evt.detail && evt.detail.stage;
    syncVectorCopy(stage, activeIndex);
  });

  function resetStuckIndexFlowState() {
    if (!isIndexPage) return;
    document.body.classList.remove('is-vector-frame-loading', 'is-question-transition-loading');
    if (!document.body.classList.contains('is-create-mode')) {
      document.body.classList.remove(
        'is-building',
        'is-amulet-rendering',
        'is-create-exiting',
        'is-choice-question',
        'is-choice-save',
        'is-semantic-questions'
      );
      if (indexCreateWorkspace) {
        indexCreateWorkspace.classList.remove('is-open');
      }
      const garden = document.getElementById('questionGarden');
      if (garden) garden.hidden = false;
    }
  }

  buildProgressDots();
  resetStuckIndexFlowState();
  restoreCompletedSession();
  updateStepIndicators(loadAnswers());
  initCreatePage();
  bindFigmaSubmitButtonHover();

  if (isIndexPage || isCreatePage) {
    window.setTimeout(async function () {
      let savedFromExport = false;
      try {
        const mod = await import('./amulet-show.js?v=20250711-result-amulet-scale');
        if (typeof mod.finishPendingSaveOnIndex === 'function') {
          savedFromExport = await mod.finishPendingSaveOnIndex();
        }
      } catch (err) {
        console.warn('[questionnaire] export save hook failed', err);
      }
      if (!savedFromExport) {
        void restoreResultViewIfNeeded();
      }
    }, 320);
  }

  if (isIndexPage) {
    window.setTimeout(function () {
      const loader = document.getElementById('pagmarGalleryFullpageLoader');
      if (
        loader &&
        !loader.hidden &&
        document.body.classList.contains('is-amulet-rendering') &&
        !document.body.classList.contains('is-result-overlay-open')
      ) {
        console.warn('[questionnaire] clearing stuck gallery loader');
        document.body.classList.remove('is-amulet-rendering', 'is-create-mode');
        if (indexCreateWorkspace) indexCreateWorkspace.hidden = true;
        if (typeof window.amuletHideLoader === 'function') {
          window.amuletHideLoader({ force: true });
        }
      }
    }, 20000);
  }

  if (isIndexPage) {
    window.startIndexCreateFlow = startIndexCreateFlow;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const openCreateFromUrl =
        urlParams.get('create') === '1' ||
        urlParams.get('questionnaire') === '1' ||
        urlParams.get('q') === '1';
      if (openCreateFromUrl) {
        window.setTimeout(function () {
          startIndexCreateFlow();
        }, 0);
      } else if (sessionStorage.getItem('pagmarRestartQuestionnaireOnLoad') === '1') {
        sessionStorage.removeItem('pagmarRestartQuestionnaireOnLoad');
        window.setTimeout(function () {
          if (typeof window.pagmarRestartQuestionnaire === 'function') {
            window.pagmarRestartQuestionnaire();
          } else {
            startIndexCreateFlow();
          }
        }, 0);
      } else if (sessionStorage.getItem('pagmarOpenCreateOnLoad') === '1') {
        sessionStorage.removeItem('pagmarOpenCreateOnLoad');
        window.setTimeout(function () {
          startIndexCreateFlow();
        }, 0);
      }
    } catch (_) {}
  }

  window.pagmarPushResultHistory = pushResultHistory;
  window.pagmarResetCreateHistoryAfterSave = resetCreateHistoryAfterSave;
  window.pagmarStopCreateFlowEffects = stopCreateFlowEffects;
  window.pagmarRestartQuestionnaire = restartQuestionnaireFromResult;
})();
