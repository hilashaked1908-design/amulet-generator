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

  const requestProgressCurrent = document.getElementById('requestProgressCurrent');
  const requestProgressTotal = document.getElementById('requestProgressTotal');
  const requestArtboard = document.getElementById('requestArtboard');
  const requestActiveCard = document.getElementById('requestActiveCard');
  const requestCloseBtn = document.getElementById('requestCloseBtn');
  const requestStepMarkers = requestArtboard
    ? Array.from(requestArtboard.querySelectorAll('.figma-step-marker'))
    : [];

  const frame = document.getElementById('questionFrame');
  const frameStar = document.getElementById('questionFrameStar');
  const fieldWrap = document.getElementById('questionField');
  const submitBtn = document.getElementById('questionSubmit');
  const saveWrap =
    submitBtn &&
    (submitBtn.closest('.figma-q__btn-outer') || submitBtn.closest('.pagmar__create-save-wrap'));
  const labelEl = document.getElementById('questionLabel');
  const textEl = document.getElementById('questionText');
  const descEl = document.getElementById('questionDesc');
  const tagEl = document.getElementById('questionTag');

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

  async function runPlaceholderCycle(field, examples, token) {
    if (!examples.length || !isPlaceholderSession(token)) return;

    if (!prefersPlaceholderMotion()) {
      if (isPlaceholderFieldIdle(field)) {
        field.placeholder = examples[0];
      }
      return;
    }

    let index = 0;
    while (isPlaceholderSession(token)) {
      if (!isPlaceholderFieldIdle(field)) return;

      const text = examples[index % examples.length];
      field.classList.add('is-typing-placeholder');

      for (let i = 0; i <= text.length; i += 1) {
        if (!isPlaceholderSession(token) || !isPlaceholderFieldIdle(field)) return;
        field.placeholder = i < text.length ? text.slice(0, i) + PLACEHOLDER_CURSOR : text;
        if (i < text.length) await placeholderSleep(PLACEHOLDER_CHAR_MS);
      }

      await placeholderSleep(PLACEHOLDER_HOLD_MS);
      if (!isPlaceholderSession(token) || !isPlaceholderFieldIdle(field)) return;

      for (let i = text.length; i >= 0; i -= 1) {
        if (!isPlaceholderSession(token) || !isPlaceholderFieldIdle(field)) return;
        field.placeholder = i > 0 ? text.slice(0, i) + PLACEHOLDER_CURSOR : '';
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

    if (!Array.isArray(question.placeholderExamples) || question.placeholderExamples.length < 2) {
      field.placeholder = question.placeholder || examples[0] || '';
      return;
    }

    const token = placeholderCycleToken;

    const onFocus = function () {
      field.classList.remove('is-typing-placeholder');
      placeholderCycleToken += 1;
      if (!field.value.trim()) {
        field.placeholder = examples[0] || question.placeholder || '';
      }
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
      void runPlaceholderCycle(field, examples, resumeToken);
    };

    field.addEventListener('focus', onFocus);
    field.addEventListener('input', onInput);
    field.addEventListener('blur', onBlur);
    placeholderFieldHandlers = { field: field, onFocus: onFocus, onInput: onInput, onBlur: onBlur };

    void runPlaceholderCycle(field, examples, token);
  }

  let amuletModulesReady = null;

  function ensureAmuletModules() {
    if (amuletModulesReady) return amuletModulesReady;
    amuletModulesReady = Promise.all([
      import('./amulet-build.js?v=20250705-q4-instant'),
      import('./amulet-show.js?v=20250705-meadow-focus'),
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
    if (!submitBtn) return;
    const isLast = index === questions.length - 1;
    const text = isLast ? CREATE_SAVE_LABEL_FINAL : CREATE_SAVE_LABEL_NEXT;

    const requestLabel = submitBtn.querySelector('.figma-q__btn-label, .pagmar__request-next__label');
    if (requestLabel) {
      requestLabel.textContent = text;
      return;
    }

    const labels = submitBtn.querySelectorAll('.pagmar__create-save-label');
    if (!labels.length) return;
    labels.forEach(function (el) {
      el.textContent = text;
    });

    const labelRoot =
      submitBtn.closest('.figma-q__btn-outer') ||
      submitBtn.closest('.pagmar__create-save-wrap') ||
      submitBtn;
    labelRoot.style.setProperty('--create-save-label-w', isLast ? '118' : '134');
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
      if (numEl) numEl.textContent = String(step);
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
  }

  function applyRequestStepRailLines(activeMarker, activeStep) {
    if (!requestArtboard) return;
    const grayLine = requestArtboard.querySelector('.figma-step-rail__line--137');
    const whiteLine = requestArtboard.querySelector('.figma-step-rail__line--progress');
    if (!grayLine) return;

    requestAnimationFrame(function () {
      const lineRect = grayLine.getBoundingClientRect();
      if (!lineRect.height) return;

      let gap = null;
      if (activeMarker) {
        const markerRect = activeMarker.getBoundingClientRect();
        const gapTop = Math.max(0, markerRect.top - lineRect.top);
        const gapBottom = Math.min(lineRect.height, markerRect.bottom - lineRect.top);
        if (gapBottom > gapTop + 1) {
          gap = { start: gapTop, end: gapBottom };
        }
      }

      const graySegments = gap
        ? subtractRailSegment({ start: 0, end: lineRect.height }, gap)
        : [{ start: 0, end: lineRect.height }];
      applyStepRailMask(grayLine, lineRect.height, graySegments);

      if (!whiteLine) return;

      if (activeStep <= 1) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      const topMarker = getRequestStepMarker(activeStep);
      const bottomMarker = getRequestStepMarker(1);
      if (!topMarker || !bottomMarker) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      const topRect = topMarker.getBoundingClientRect();
      const bottomRect = bottomMarker.getBoundingClientRect();
      const progress = {
        start: Math.max(0, topRect.bottom - lineRect.top),
        end: Math.min(lineRect.height, bottomRect.top - lineRect.top),
      };

      if (progress.end <= progress.start + 1) {
        applyStepRailMask(whiteLine, lineRect.height, []);
        return;
      }

      let whiteSegments = [progress];
      if (gap) {
        whiteSegments = whiteSegments.flatMap(function (segment) {
          return subtractRailSegment(segment, gap);
        });
      }
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
      if (onSwap) onSwap();
      requestAnimationFrame(function () {
        requestArtboard.classList.remove('is-advancing');
      });
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

  function getChoiceRowIndices(optionCount) {
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

    if (question.type === 'text' || question.key === 'q3WhyNow') {
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
      alert('לא הצלחנו לטעון את מערכת הקמע. בדקי חיבור לאינטרנט ורענני.');
      return;
    }

    if (typeof window.showFinishedAmulet === 'function') {
      await window.showFinishedAmulet(answers);
      return;
    }

    try {
      const mod = await import('./amulet-show.js?v=20250705-meadow-focus');
      await mod.showFinishedAmulet(answers);
    } catch (err) {
      console.error('[questionnaire] failed to load amulet renderer', err);
      document.body.classList.remove('is-amulet-rendering');
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

  function resetCreateHistoryAfterSave() {
    createHistoryPushed = false;
    createPopstateIgnore = 2;
    try {
      history.go(-2);
    } catch (_) {
      createPopstateIgnore = 0;
      try {
        history.replaceState(null, '');
      } catch (_e) {}
    }
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

  async function runAmuletBuild(answers) {
    if (!isCreateFlow()) return;
    try {
      await ensureAmuletModules();
    } catch (err) {
      console.error('[questionnaire] failed to load amulet build', err);
      return;
    }
    if (typeof window.amuletBuildUpdate !== 'function') return;
    setBuilding(true);
    try {
      await window.amuletBuildUpdate(answers);
    } finally {
      setBuilding(false);
    }
  }

  /** Q4–Q7: vectors already visible — only warm PBR compose when browser is idle. */
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

  function saveAnswer(index, value) {
    const question = questions[index];
    if (!question) return;

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
          mountAmuletInCreateSlot();
          await runAmuletBuild(answers);
          document.body.classList.add('is-amulet-rendering');
          await showFinishedAmuletNow(answers);
          return;
        }
        const nextIndex = nextUnansweredIndex(answers);
        openModal(nextIndex);
        mountAmuletInCreateSlot();
        if (index >= 3 && index <= 6) {
          schedulePostVectorPrecompose(answers, index);
        } else {
          void runAmuletBuild(answers);
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

  function renderCreateField(question, answers, index) {
    fieldWrap.innerHTML = '';
    delete fieldWrap.dataset.choiceValue;
    const value = answers[question.key] || '';
    const useSaveForChoice =
      question.type === 'choice' && (isRequestFlowActive() || index >= 3);

    if (question.type === 'choice') {
      if (submitBtn) submitBtn.hidden = !useSaveForChoice;
      if (saveWrap) saveWrap.hidden = !useSaveForChoice;

      let selectedValue = value;
      if (useSaveForChoice && selectedValue) {
        fieldWrap.dataset.choiceValue = selectedValue;
      }

      const rowPlan = getChoiceRowIndices(question.options.length);
      const grid = document.createElement('div');
      grid.className = 'intro__choice-grid intro__choice-grid--figma';
      grid.dataset.choiceCount = String(question.options.length);

      rowPlan.forEach(function (indices, rowIndex) {
        const row = document.createElement('div');
        row.className = 'intro__choice-grid-row';
        if (indices.length < 3) {
          row.classList.add('intro__choice-grid-row--partial');
        }
        indices.forEach(function (optIndex) {
          const opt = question.options[optIndex];
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'intro__choice-btn intro__choice-btn--figma' +
            (selectedValue === opt.value ? ' is-selected' : '') +
            (opt.fitWidth ? ' is-fit-width' : '');
          btn.textContent = opt.label;
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (useSaveForChoice) {
              selectedValue = opt.value;
              fieldWrap.dataset.choiceValue = opt.value;
              grid.querySelectorAll('.intro__choice-btn--figma').forEach(function (b) {
                b.classList.toggle('is-selected', b === btn);
              });
              if (submitBtn) submitBtn.disabled = !validate(question, opt.value);
              return;
            }
            saveAnswer(index, opt.value);
          });
          row.appendChild(btn);
        });
        grid.appendChild(row);
      });
      fieldWrap.appendChild(grid);
      return null;
    }

    submitBtn.hidden = false;
    if (saveWrap) saveWrap.hidden = false;

    if (question.type === 'textarea') {
      const el = document.createElement('textarea');
      el.className = 'intro__question-input';
      el.rows = 2;
      el.placeholder = '';
      el.value = value;
      fieldWrap.appendChild(el);
      return el;
    }

    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'intro__question-input intro__question-input--single';
    el.placeholder = '';
    el.value = value;
    fieldWrap.appendChild(el);
    return el;
  }

  function applyRequestQuestionLayout(question) {
    if (requestActiveCard) {
      requestActiveCard.classList.toggle(
        'is-title-offset-slot',
        Boolean(question.figmaTitleOffset)
      );
      requestActiveCard.classList.toggle(
        'is-request-wish-step',
        question.key === 'q1Wish'
      );
    }
  }

  function setCreateQuestionText(question) {
    if (tagEl) {
      tagEl.textContent = question.tag || '[בקשה]';
    }
    applyRequestQuestionLayout(question);
    const copyEl = requestActiveCard && requestActiveCard.querySelector('.figma-q__copy');
    if (copyEl) {
      copyEl.classList.toggle('is-title-offset', Boolean(question.figmaTitleOffset));
    }
    if (!textEl) return;
    textEl.textContent = question.text;
    if (descEl) {
      if (question.description) {
        descEl.textContent = question.description;
        descEl.hidden = false;
      } else {
        descEl.textContent = '';
        descEl.hidden = true;
      }
    }
  }

  function ensureCreateSaveVisible() {
    if (typeof window.restoreCreateQuestionInput === 'function') {
      window.restoreCreateQuestionInput();
    }
    document.body.classList.remove('is-create-complete', 'is-create-amulet-ready');
    const workspace = document.getElementById('indexCreateWorkspace');
    if (workspace) {
      workspace.classList.remove('is-create-complete');
    }
    const saveWrapEl = document.querySelector('.figma-q__btn-outer, .pagmar__create-save-wrap');
    const submitEl = document.getElementById('questionSubmit');
    const questionBox = document.querySelector('.figma-q__field-box, .pagmar__create-question-box');
    if (questionBox) {
      questionBox.hidden = false;
      questionBox.style.removeProperty('display');
    }
    if (saveWrapEl) {
      saveWrapEl.hidden = false;
      saveWrapEl.style.removeProperty('display');
    }
    if (submitEl) {
      submitEl.hidden = false;
    }
  }

  function populateCreateQuestion(index) {
    const question = questions[index];
    if (!question || !frame) return;

    ensureCreateSaveVisible();

    if (typeof window.gardenCapturePlacementAnchor === 'function') {
      window.gardenCapturePlacementAnchor();
    }

    applyCreateLayout(question);

    document.body.classList.toggle('is-choice-question', question.type === 'choice');
    if (indexCreateWorkspace) {
      indexCreateWorkspace.classList.toggle('is-choice-question', question.type === 'choice');
    }

    const answers = loadAnswers();
    if (labelEl) labelEl.textContent = questionNumber(index);
    setCreateQuestionText(question);
    updateRequestProgress(index);

    const fieldEl = renderCreateField(question, answers, index);
    setCreateSaveLabel(index);

    if (fieldEl) {
      startPlaceholderCycle(fieldEl, question);
      submitBtn.disabled = !validate(question, fieldEl.value.trim());
      fieldEl.addEventListener('input', function () {
        if (document.body.classList.contains('is-building')) return;
        submitBtn.disabled = !validate(question, fieldEl.value.trim());
      });
    } else {
      stopPlaceholderCycle();
      if (question.type === 'choice' && (isRequestFlowActive() || index >= 3)) {
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

    requestAnimationFrame(function () {
      if (!fieldEl) return;
      if (fieldEl.value.trim()) {
        fieldEl.focus();
        return;
      }
      if (!Array.isArray(question.placeholderExamples) || !question.placeholderExamples.length) {
        fieldEl.focus();
      }
    });
  }

  function openCreatePanel(index) {
    const question = questions[index];
    if (!question || !frame) return;

    const isAdvance =
      isRequestFlowActive() && activeIndex !== null && activeIndex !== index;

    if (isAdvance) {
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

    question.options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'pagmar__choice-pill' + (current === opt.value ? ' is-selected' : '');
      btn.dataset.value = opt.value;
      btn.textContent = opt.label;
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

    /* Figma Frame 265 — label anchored to physical left of amulet */
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
    const trimmed = (wish || '').trim();
    if (!trimmed || trimmed === '—') return '—';
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
    /* מיקום מרכזי דרך CSS — רק מעדכן גובה דינמי לשאלות בחירה */
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
    if (typeof window.restoreCreateQuestionInput === 'function') {
      window.restoreCreateQuestionInput();
    }
    document.body.classList.remove(
      'is-create-exiting',
      'is-create-mode',
      'is-panel-open',
      'is-building',
      'is-amulet-ready',
      'is-create-amulet-ready',
      'is-amulet-rendering',
      'is-choice-question',
      'is-result-overlay-open'
    );
    var resultOverlay = document.getElementById('resultOverlay');
    if (resultOverlay) {
      resultOverlay.classList.remove('is-visible');
      resultOverlay.hidden = true;
    }
    window.dispatchEvent(new CustomEvent('questionnaire:create-close'));

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
    if (document.body.classList.contains('is-result-overlay-open')) return;
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
    const saveWrap = document.querySelector('.figma-q__btn-outer, .pagmar__create-save-wrap');
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
      });
    });

    pushCreateHistory();
  }

  function exitCreatePage() {
    if (!isCreatePage) return;
    sessionStorage.removeItem(STORAGE_KEY);
    if (createHistoryPushed && history.length > 1) {
      createHistoryPushed = false;
      try {
        history.back();
        return;
      } catch (_) {}
    }
    createHistoryPushed = false;
    window.location.href = 'index.html';
  }

  function handleRequestClose() {
    stopPlaceholderCycle();
    if (document.body.classList.contains('is-result-overlay-open')) return;
    cancelCreateBuildIfNeeded();
    if (
      document.body.classList.contains('is-amulet-ready') ||
      document.body.classList.contains('is-create-amulet-ready')
    ) {
      return;
    }
    if (isIndexCreateMode()) {
      if (createHistoryPushed && history.length > 1) {
        createHistoryPushed = false;
        try {
          history.back();
        } catch (_) {}
        return;
      }
      createHistoryPushed = false;
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

  if (textClose) {
    textClose.addEventListener('click', closePanel);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      if (activeIndex === null || !frame) return;
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
      if (activeIndex !== null && isRequestFlowActive()) {
        updateRequestStepRail(activeIndex);
      }
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
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('amuletUserAnswers');
    sessionStorage.removeItem('amuletComposed3D');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('amuletUserAnswers');
      localStorage.removeItem('amuletComposed3D');
    } catch (_) {}
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
    window.setTimeout(function () {
      openModal(0);
    }, 120);
    pushCreateHistory();
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

  buildProgressDots();
  restoreCompletedSession();
  updateStepIndicators(loadAnswers());
  initCreatePage();
  bindFigmaSubmitButtonHover();

  if (isIndexPage) {
    window.startIndexCreateFlow = startIndexCreateFlow;
  }

  window.pagmarPushResultHistory = pushResultHistory;
  window.pagmarResetCreateHistoryAfterSave = resetCreateHistoryAfterSave;
})();
