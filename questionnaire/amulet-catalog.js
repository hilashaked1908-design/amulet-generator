(function () {
  'use strict';

  /** Gallery demo data removed - only user amulets in the garden are indexed. */
  window.AMULET_CATALOG = [];

  const Q5_FEELING_TO_DOMAIN = {
    hope: 'love',
    fear: 'livelihood',
    longing: 'family',
    excitement: 'housing',
    impatience: 'health',
    confusion: 'meaning',
  };

  const DOMAIN_LABEL = {
    love: 'אהבה',
    livelihood: 'פרנסה',
    family: 'משפחה',
    health: 'בריאות',
    housing: 'מגורים',
    meaning: 'משמעות',
    selfConfidence: 'ביטחון עצמי',
  };

  const Q6_TAG_LABEL = {
    uncertainty: 'חוסר וודאות',
    waiting: 'לחכות',
    letting_go: 'להצליח לשחרר',
    failure: 'שליטה',
    no_control: 'לקבל חוסר שליטה',
    decision: 'לקבל החלטה',
  };

  const Q5_COMPONENT_MAT = {
    hope: 'פולימר',
    fear: 'כרום·שחור',
    longing: 'זכוכית',
    excitement: 'כרום·כסף',
    impatience: 'שחור·מט',
    confusion: 'מתכת',
  };

  const Q4_COMPONENT_MAT = {
    concrete_actions: 'אבן·sage',
    signs: 'חצץ',
    gut: 'חם·בז׳',
    support: 'בזלת',
    doubt: 'שיש·חם',
  };

  const Q6_COMPONENT_MAT = {
    uncertainty: 'חלק',
    waiting: 'חלק',
    letting_go: 'בינוני',
    failure: 'מחוספס',
    no_control: 'קוצני',
    decision: 'קוצני',
  };

  function resolveChoiceLabel(key, value) {
    const questions = window.AMULET_QUESTIONS || [];
    const question = questions.find(function (q) {
      return q.key === key;
    });
    if (!question || !question.options) return value || '-';
    const option = question.options.find(function (o) {
      return o.value === value;
    });
    return option ? option.label : value || '-';
  }

  function formatWish(text) {
    const raw = window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(text) : text;
    const trimmed = (raw || '').trim();
    if (!trimmed) return '-';
    if (trimmed.charAt(0) === '״' || trimmed.charAt(0) === '"') return trimmed;
    return '״' + trimmed + '״';
  }

  function stripQuotes(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/^[\u05F4"\u201C]+|[\u05F4"\u201D]+$/g, '').trim();
  }

  /** Topic rules derived from wish/change text - aligned with index filter sidebar labels. */
  const CONTENT_TOPIC_RULES = [
    {
      key: 'family',
      labels: ['משפחה'],
      pattern:
        /משפח(?:ה|תית)|הורים|(?:^|[\s,.])א(?:מא|בא)(?:[\s,.]|$)|אח(?:ות|י\b)|ילד(?:ים|ה)?|סב(?:ת)?(?:ה|א)|הריון|(?:להיות|אהיה)\s+אמ(?:א|ן)|נק(?:ים|ום)\s+משפח|התאחד\s+המשפח/i,
      fields: ['q1Wish', 'q3WhyNow', 'q7Change', 'q8Motivation'],
    },
    {
      key: 'love',
      labels: ['זוגיות', 'אהבה'],
      pattern:
        /(?:^|[\s,.])א(?:הב(?:ה)?)(?:[\s,.]|$)|בן\s*זוג|בת\s*זוג|ניש(?:ו(?:י(?:ין|ם)?)|ו(?:יים|ים))|להתחת(?:ן|ין)|חתונ(?:ה|ות)|(?:^|[\s,.])רווק(?:ה)?(?:[\s,.]|$)|פרטנר|בעלי\s+לעתיד|הציע(?:\s+לי)?\s+(?:ניש|טבעת)|למצוא\s+(?:א(?:הבה|ת)|ב(?:ן|ת)\s*זוג)/i,
      fields: ['q1Wish', 'q3WhyNow', 'q7Change', 'q8Motivation'],
    },
    {
      key: 'health',
      labels: ['בריאות'],
      pattern:
        /בריא(?:ות|(?:ה)?\s+יותר)?|(?:ה)?ע(?:י)?ש(?:ון|ן)|סיגר(?:יות|יה)?|(?:י)?חל(?:ים|ה|ות|ימ)|מחל(?:ה|ות)|ר(?:פוא|יצ)|הפסיק\s+לע(?:וש|ש)/i,
      fields: ['q1Wish', 'q3WhyNow', 'q7Change', 'q8Motivation'],
    },
    {
      key: 'housing',
      labels: ['מגורים'],
      pattern: /דיר(?:ה|ת)|מגור(?:ים)?|בית\s+(?:גדול|חדש|משלי|ב)/i,
      fields: ['q1Wish', 'q7Change'],
    },
    {
      key: 'livelihood',
      labels: ['פרנסה'],
      pattern:
        /(?:^|[\s,.])(?:ע(?:בוד(?:ה|ות)|סק)|פרנס|קרייר|(?:ל)?מצ(?:א|וא)\s+עבוד|תואר|שכ(?:ר|ור)|התפטר|משר(?:ה|ות)|(?:להיות\s+)?עצמא|פתח(?:ו)?\s+עסק)/i,
      fields: ['q1Wish', 'q7Change'],
    },
    {
      key: 'selfConfidence',
      labels: ['ביטחון עצמי'],
      pattern:
        /(?:לאהוב|אוהב(?:ת)?|אהב(?:ה)?)\s+(?:את\s+)?עצמי|ביטחון\s+עצמי|סלוח\s+לעצמ/i,
      fields: ['q1Wish', 'q7Change'],
    },
  ];

  const DOMAIN_PRIMARY_ORDER = [
    'selfConfidence',
    'family',
    'love',
    'health',
    'housing',
    'livelihood',
    'meaning',
  ];

  function recordTextFromFields(data, fields) {
    return (fields || ['q1Wish', 'q3WhyNow', 'q7Change', 'q8Motivation'])
      .map(function (key) {
        return stripQuotes(data && data[key]);
      })
      .filter(Boolean)
      .join(' ');
  }

  function topicKeysFromRecord(data, restrictToField) {
    const keys = new Set();
    CONTENT_TOPIC_RULES.forEach(function (rule) {
      if (restrictToField && rule.fields.indexOf(restrictToField) === -1) return;
      const fields = restrictToField ? [restrictToField] : rule.fields;
      const text = recordTextFromFields(data, fields);
      if (text && rule.pattern.test(text)) keys.add(rule.key);
    });
    return keys;
  }

  function primaryTopicKeyFromRecord(data) {
    const passes = ['q1Wish', 'q7Change', null];
    for (let p = 0; p < passes.length; p += 1) {
      const restrict = passes[p];
      for (let i = 0; i < DOMAIN_PRIMARY_ORDER.length; i += 1) {
        const key = DOMAIN_PRIMARY_ORDER[i];
        const rule = CONTENT_TOPIC_RULES.find(function (r) {
          return r.key === key;
        });
        if (!rule) continue;
        if (restrict && rule.fields.indexOf(restrict) === -1) continue;
        const fields = restrict ? [restrict] : rule.fields;
        const text = recordTextFromFields(data, fields);
        if (text && rule.pattern.test(text)) return key;
      }
    }
    return null;
  }

  function contentFilterLabelsFromRecord(data) {
    const labels = new Set();
    const matchedKeys = topicKeysFromRecord(data);
    CONTENT_TOPIC_RULES.forEach(function (rule) {
      if (!matchedKeys.has(rule.key)) return;
      rule.labels.forEach(function (label) {
        labels.add(label);
      });
      const domainLabel = DOMAIN_LABEL[rule.key];
      if (domainLabel) labels.add(domainLabel);
    });
    return labels;
  }

  function domainKeyFromRecord(data) {
    const topicKey = primaryTopicKeyFromRecord(data);
    if (topicKey) return topicKey;
    const feeling = data && data.q5Feeling;
    return Q5_FEELING_TO_DOMAIN[feeling] || 'love';
  }

  function domainLabelFromRecord(data) {
    const domainKey = domainKeyFromRecord(data);
    return DOMAIN_LABEL[domainKey] || DOMAIN_LABEL.love;
  }

  /** Hebrew labels that match sidebar filter buttons for one amulet record. */
  function filterLabelsFromRecord(data) {
    const record = data || {};
    const labels = new Set();
    const domainKey = domainKeyFromRecord(record);
    const domainLabel = DOMAIN_LABEL[domainKey];
    if (domainLabel) labels.add(domainLabel);

    const q5Label = resolveChoiceLabel('q5Feeling', record.q5Feeling);
    const q4Label = resolveChoiceLabel('q4Belief', record.q4Belief);
    const q6Label =
      Q6_TAG_LABEL[record.q6Difficulty] ||
      resolveChoiceLabel('q6Difficulty', record.q6Difficulty);

    if (q5Label && q5Label !== '-') labels.add(q5Label);
    if (q4Label && q4Label !== '-') {
      labels.add(q4Label);
      if (record.q4Belief === 'support') labels.add('תמיכה מהסביבה שלי');
      if (record.q4Belief === 'signs') labels.add('סימנים וצירופי מקרים');
      if (record.q4Belief === 'concrete_actions') labels.add('מעשים שאני עושה');
    }
    if (q6Label && q6Label !== '-') labels.add(q6Label);

    if (domainKey === 'love') labels.add('זוגיות');
    if (domainKey === 'family') labels.add('משפחה');

    contentFilterLabelsFromRecord(record).forEach(function (label) {
      labels.add(label);
    });

    if (record.q4Belief === 'doubt') labels.add('לא מאמין שזה יקרה');
    if (record.q6Difficulty === 'no_control') labels.add('לא לדעת מה יקרה');

    return Array.from(labels);
  }

  function userAmuletBaseIndex() {
    return (window.AMULET_QUESTIONS || []).length;
  }

  function hasLiveUserAmuletSnapshot() {
    if (typeof window.gardenHasUserAmuletSnapshot === 'function') {
      return window.gardenHasUserAmuletSnapshot();
    }
    try {
      return Boolean(
        sessionStorage.getItem('amuletUserSnapshot') ||
          localStorage.getItem('amuletUserSnapshot')
      );
    } catch (_) {
      return false;
    }
  }

  /** Indices for amulets that exist in the garden (collection + active user amulet). */
  window.getGardenAmuletIndices = function () {
    if (typeof window.gardenListAmuletIndices === 'function') {
      var live = window.gardenListAmuletIndices();
      if (live && live.length) return live.slice();
    }

    const base = userAmuletBaseIndex();
    const collection = loadAmuletCollection();
    const indices = [];
    for (let i = 0; i < collection.length; i += 1) {
      indices.push(base + i);
    }
    if (hasLiveUserAmuletSnapshot()) {
      indices.push(base + collection.length);
    }
    return indices;
  };

  function isGardenAmuletIndex(index) {
    return index >= userAmuletBaseIndex();
  }

  function getAmuletRecordForIndex(index) {
    if (!isGardenAmuletIndex(index)) return null;
    if (typeof window.getAmuletRecord === 'function') {
      return window.getAmuletRecord(index);
    }
    return null;
  }

  window.amuletMatchesFilterLabel = function (index, filterLabel) {
    return window.amuletMatchesFilterLabels(index, filterLabel ? [filterLabel] : []);
  };

  window.amuletMatchesFilterLabels = function (index, filterLabels) {
    const labels = normalizeFilterLabels(filterLabels);
    if (!labels.length) return true;
    const record = getAmuletRecordForIndex(index);
    if (!record) return false;
    const amuletLabels = filterLabelsFromRecord(record);
    for (let i = 0; i < labels.length; i += 1) {
      if (amuletLabels.indexOf(labels[i]) === -1) return false;
    }
    return true;
  };

  function normalizeFilterLabels(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.filter(function (label) {
        return typeof label === 'string' && label.trim();
      });
    }
    return typeof input === 'string' && input.trim() ? [input.trim()] : [];
  }

  window.getAmuletFilterLabels = function (index) {
    const record = getAmuletRecordForIndex(index);
    if (!record) return [];
    return filterLabelsFromRecord(record);
  };

  window.getMatchingAmuletIndices = function (filterLabelOrLabels) {
    const labels = normalizeFilterLabels(filterLabelOrLabels);
    return window.getGardenAmuletIndices().filter(function (index) {
      return window.amuletMatchesFilterLabels(index, labels);
    });
  };

  window.getActiveFilterTagLabels = function (filterLabelOrLabels) {
    return normalizeFilterLabels(filterLabelOrLabels);
  };

  function buildStoryParagraph(data) {
    const wish = stripQuotes(data.q1Wish);
    const whyNow = stripQuotes(data.q3WhyNow);
    const change = stripQuotes(data.q7Change);
    const parts = [wish, whyNow, change].filter(Boolean);
    if (!parts.length) return '-';
    return '״' + parts.join('. ') + '״';
  }

  function buildComponentsFromRecord(data) {
    const q5Label = resolveChoiceLabel('q5Feeling', data.q5Feeling);
    const q4Label = resolveChoiceLabel('q4Belief', data.q4Belief);
    const q6Label = Q6_TAG_LABEL[data.q6Difficulty] || resolveChoiceLabel('q6Difficulty', data.q6Difficulty);
    const q5Mat = Q5_COMPONENT_MAT[data.q5Feeling] || '-';
    const q4Mat = Q4_COMPONENT_MAT[data.q4Belief] || '-';
    const q6Mat = Q6_COMPONENT_MAT[data.q6Difficulty] || '-';
    const lines = [];
    if (q5Label !== '-' && q5Mat !== '-') lines.push(q5Label + '- ' + q5Mat);
    if (q4Label !== '-' && q4Mat !== '-') lines.push(q4Label + '- ' + q4Mat);
    if (q6Label !== '-' && q6Mat !== '-') lines.push(q6Label + '- ' + q6Mat);
    return lines;
  }

  function buildTagsFromRecord(data) {
    const q5Label = resolveChoiceLabel('q5Feeling', data.q5Feeling);
    const q4Label = resolveChoiceLabel('q4Belief', data.q4Belief);
    const q6Label = Q6_TAG_LABEL[data.q6Difficulty] || resolveChoiceLabel('q6Difficulty', data.q6Difficulty);
    const domain = domainLabelFromRecord(data);
    return [q5Label, q4Label, q6Label, domain].filter(function (label) {
      return label && label !== '-';
    });
  }

  function buildSpecFromRecord(record) {
    const data = record || {};
    return {
      wish: formatWish(data.q1Wish),
      name: (data.q2Name || '').trim() || '-',
      whyNow: (data.q3WhyNow || '').trim() || '-',
      change: (data.q7Change || '').trim() || '-',
      story: buildStoryParagraph(data),
      components: buildComponentsFromRecord(data),
      tags: buildTagsFromRecord(data),
    };
  }

  function getUserAmuletSpec(answers) {
    const a = answers || {};
    return buildSpecFromRecord({
      q1Wish: a.q1Wish,
      q2Name: a.q2Name,
      q3WhyNow: a.q3WhyNow,
      q7Change: a.q7Change,
      q5Feeling: a.q5Feeling,
      q4Belief: a.q4Belief,
      q6Difficulty: a.q6Difficulty,
    });
  }

  function loadAmuletCollection() {
    if (typeof window.gardenLoadCollection === 'function') {
      return window.gardenLoadCollection();
    }
    try {
      var raw = localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function findCollectionEntryById(entryId) {
    if (entryId == null) return null;
    var collection = loadAmuletCollection();
    for (var i = 0; i < collection.length; i += 1) {
      if (collection[i] && collection[i].id === entryId) return collection[i];
    }
    return null;
  }

  function entryIdForAmuletIndex(index) {
    var base = userAmuletBaseIndex();
    if (index < base) return null;
    var collectionIndex = index - base;
    var collection = loadAmuletCollection();
    if (collectionIndex < collection.length) {
      var entry = collection[collectionIndex];
      return entry && entry.id != null ? entry.id : null;
    }
    return null;
  }

  window.pagmarEntryIdForAmuletIndex = entryIdForAmuletIndex;
  window.pagmarFindCollectionEntryById = findCollectionEntryById;
  window.pagmarResolveCollectionEntry = function (index) {
    var entryId = entryIdForAmuletIndex(index);
    return entryId != null ? findCollectionEntryById(entryId) : null;
  };

  window.getAmuletSpec = function (index, answers, recordOverride) {
    const base = userAmuletBaseIndex();
    if (index < base) {
      return {
        wish: '-',
        name: '-',
        whyNow: '-',
        change: '-',
        story: '-',
        components: [],
        tags: [],
      };
    }

    if (recordOverride) return buildSpecFromRecord(recordOverride);

    var collectionIndex = index - base;
    var collection = loadAmuletCollection();
    if (collectionIndex >= 0 && collectionIndex < collection.length) {
      return buildSpecFromRecord(collection[collectionIndex].answers);
    }

    if (answers && (answers.q1Wish || answers.q2Name)) {
      return getUserAmuletSpec(answers);
    }
    var working = loadWorkingUserAnswers();
    if (working) return buildSpecFromRecord(working);
    return getUserAmuletSpec(answers);
  };

  window.loadGalleryAmuletAnswers = function () {
    return Promise.resolve(null);
  };

  function loadWorkingUserAnswers() {
    try {
      if (typeof window.gardenLoadUserAmuletAnswers === 'function') {
        var live = window.gardenLoadUserAmuletAnswers();
        if (live) return live;
      }
      var raw =
        sessionStorage.getItem('amuletUserAnswers') ||
        localStorage.getItem('amuletUserAnswers') ||
        sessionStorage.getItem('amuletQuestionnaire') ||
        localStorage.getItem('amuletQuestionnaire');
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (_) { return null; }
  }

  window.getAmuletRecord = function (index, answers, recordOverride) {
    const base = userAmuletBaseIndex();
    if (index < base) return null;

    if (recordOverride) return recordOverride;

    var collectionIndex = index - base;
    var collection = loadAmuletCollection();
    if (collectionIndex >= 0 && collectionIndex < collection.length) {
      return collection[collectionIndex].answers;
    }

    if (answers && (answers.q1Wish || answers.q2Name)) return answers;
    var working = loadWorkingUserAnswers();
    if (working) return working;
    return answers || {};
  };

  window.getAmuletImageSrc = function (index) {
    const base = userAmuletBaseIndex();
    if (index < base) return null;

    var collectionIndex = index - base;
    var collection = loadAmuletCollection();
    if (collectionIndex < collection.length) {
      return collection[collectionIndex].snapshot || null;
    }
    try {
      const raw =
        sessionStorage.getItem('amuletUserSnapshot') ||
        localStorage.getItem('amuletUserSnapshot');
      return raw || null;
    } catch (_) {
      return null;
    }
  };
})();
