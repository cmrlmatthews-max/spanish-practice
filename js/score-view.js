/* score-view.js - draw the speech score of one recording.
 * SP.scoreView.render(container, result, lang, options) clears the container and draws the score.
 * options is optional: {voice} is the voice that says single words.
 * The view shows only what Azure returned.
 */
window.SP = window.SP || {};

SP.addText({
  en: {
    svPron: 'Pronunciation score',
    svAccuracy: 'Accuracy',
    svFluency: 'Fluency',
    svWordsTitle: 'Words',
    svTapHint: 'Tap a word to see its score.',
    svDetailScore: '{word}: score {score}',
    svDetailNoScore: '{word}: no score',
    svDetailType: 'error type: {type}',
    svTypeNone: 'none',
    svTypeMispronunciation: 'Mispronunciation',
    svTypeOmission: 'Omission',
    svTypeInsertion: 'Insertion',
    svLegendGreen: 'Green: {n} or more',
    svLegendYellow: 'Yellow: {a} to {b}',
    svLegendRed: 'Red: below {n}',
    svLegendOmission: 'Struck through: omitted',
    svLegendInsertion: 'Dashed line: inserted',
    svHear: 'Hear it',
    svSlow: 'Slow',
    svLoading: 'Loading...',
    svHearFail: 'The tool cannot play this word now.'
  },
  es: {
    svPron: 'Puntuación de pronunciación',
    svAccuracy: 'Precisión',
    svFluency: 'Fluidez',
    svWordsTitle: 'Palabras',
    svTapHint: 'Toca una palabra para ver su puntuación.',
    svDetailScore: '{word}: puntuación {score}',
    svDetailNoScore: '{word}: sin puntuación',
    svDetailType: 'tipo de error: {type}',
    svTypeNone: 'ninguno',
    svTypeMispronunciation: 'Mala pronunciación',
    svTypeOmission: 'Omisión',
    svTypeInsertion: 'Inserción',
    svLegendGreen: 'Verde: {n} o más',
    svLegendYellow: 'Amarillo: de {a} a {b}',
    svLegendRed: 'Rojo: menos de {n}',
    svLegendOmission: 'Tachada: omitida',
    svLegendInsertion: 'Línea punteada: añadida',
    svHear: 'Escuchar',
    svSlow: 'Lento',
    svLoading: 'Cargando…',
    svHearFail: 'No se puede reproducir esta palabra ahora.'
  }
});

(function () {
  'use strict';

  // The largest number of words that the view loads in the background.
  var MAX_PREPARED_WORDS = 8;

  // The text keys for the error types that the tool translates.
  var TYPE_KEYS = {
    None: 'svTypeNone',
    Mispronunciation: 'svTypeMispronunciation',
    Omission: 'svTypeOmission',
    Insertion: 'svTypeInsertion'
  };

  // ---------- Small helpers ----------

  // Make an element with a class and a text.
  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }

  // Return the color name for a score: green, yellow or red.
  // The score is rounded first, so the color agrees with the number on the screen.
  function colorName(rawScore) {
    var score = Math.round(rawScore);
    if (score >= SP.config.wordColors.green) { return 'green'; }
    if (score >= SP.config.wordColors.yellow) { return 'yellow'; }
    return 'red';
  }

  // Return the text for an error type. Unknown types show as Azure gives them.
  function typeLabel(errorType, lang) {
    var key = TYPE_KEYS[errorType];
    return key ? SP.t(key, lang) : errorType;
  }

  // Return the detail line for one word.
  function detailText(word, lang) {
    var first = word.accuracy === null
      ? SP.t('svDetailNoScore', lang, { word: word.word })
      : SP.t('svDetailScore', lang, { word: word.word, score: Math.round(word.accuracy) });
    return first + ' · ' + SP.t('svDetailType', lang, { type: typeLabel(word.errorType, lang) });
  }

  // ---------- Parts of the view ----------

  // Draw the large pronunciation score.
  function buildMainScore(scores, lang) {
    var box = makeEl('div', 'sv-main sv-' + colorName(scores.pron));
    box.appendChild(makeEl('div', 'sv-main-number', String(Math.round(scores.pron))));
    box.appendChild(makeEl('div', 'sv-main-label', SP.t('svPron', lang)));
    return box;
  }

  // Draw one small number with its label.
  function buildSmallScore(label, value) {
    var box = makeEl('div', 'sv-small');
    box.appendChild(makeEl('div', 'sv-small-number', String(Math.round(value))));
    box.appendChild(makeEl('div', 'sv-small-label', label));
    return box;
  }

  // Return true if the tool can say this word. An inserted word is not in the sentence.
  function canHear(word) {
    var hasAudio = !!SP.audio && typeof SP.audio.playWord === 'function';
    return hasAudio && word.errorType !== 'Insertion' && String(word.word || '').trim() !== '';
  }

  // Draw the "Hear it" and "Slow" buttons. Return {row, show(word), hide()}.
  function buildHearRow(detail, lang, voice) {
    var row = makeEl('div', 'sv-hear');
    row.hidden = true;
    var normal = makeEl('button', 'secondary', SP.t('svHear', lang));
    var slow = makeEl('button', 'secondary', SP.t('svSlow', lang));
    normal.type = 'button';
    slow.type = 'button';
    row.appendChild(normal);
    row.appendChild(slow);
    var current = null;

    // Put both buttons back to their normal state.
    function setIdle() {
      normal.textContent = SP.t('svHear', lang);
      slow.textContent = SP.t('svSlow', lang);
      normal.disabled = false;
      slow.disabled = false;
    }

    // Play the current word. The call to playWord must stay inside the tap.
    function tap(button, isSlow) {
      var word = current;
      if (!word) { return; }
      var wait = SP.audio.wordStatus(word.word, voice) !== 'ready';
      var promise = SP.audio.playWord(word.word, voice, isSlow);
      if (wait) {
        normal.disabled = true;
        slow.disabled = true;
        button.textContent = SP.t('svLoading', lang);
      }
      promise.then(function (started) {
        if (wait) { setIdle(); }
        if (!started && current === word) { detail.textContent = SP.t('svHearFail', lang); }
      });
    }

    normal.addEventListener('click', function () { tap(normal, false); });
    slow.addEventListener('click', function () { tap(slow, true); });
    return {
      row: row,
      show: function (word) { current = word; setIdle(); row.hidden = false; },
      hide: function () { current = null; row.hidden = true; }
    };
  }

  // Draw one tappable word button.
  function buildWordButton(word, parts, lang, buttons) {
    var btn = makeEl('button', 'sv-word', word.word);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    if (word.accuracy !== null) { btn.classList.add('sv-' + colorName(word.accuracy)); }
    if (word.errorType === 'Omission') { btn.classList.add('sv-omitted'); }
    if (word.errorType === 'Insertion') { btn.classList.add('sv-inserted'); }
    btn.addEventListener('click', function () {
      buttons.forEach(function (other) {
        other.classList.remove('sv-selected');
        other.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('sv-selected');
      btn.setAttribute('aria-pressed', 'true');
      parts.detail.textContent = detailText(word, lang);
      if (!parts.hear) { return; }
      if (canHear(word)) { parts.hear.show(word); } else { parts.hear.hide(); }
    });
    return btn;
  }

  // Draw the word buttons, the detail line, and the hear buttons.
  function buildWords(words, lang, voice) {
    var section = makeEl('div', 'sv-words-section');
    section.appendChild(makeEl('div', 'sv-words-title', SP.t('svWordsTitle', lang)));
    var list = makeEl('div', 'sv-words');
    var detail = makeEl('p', 'sv-detail', SP.t('svTapHint', lang));
    detail.setAttribute('role', 'status');
    var hasAudio = !!SP.audio && typeof SP.audio.playWord === 'function';
    var parts = { detail: detail, hear: hasAudio ? buildHearRow(detail, lang, voice) : null };
    var buttons = [];
    words.forEach(function (word) {
      var btn = buildWordButton(word, parts, lang, buttons);
      buttons.push(btn);
      list.appendChild(btn);
    });
    section.appendChild(list);
    section.appendChild(detail);
    if (parts.hear) { section.appendChild(parts.hear.row); }
    return section;
  }

  // Load the voice clips of the weak words in the background. Use at most 8 words.
  function prepareWeakWords(words, voice) {
    if (!SP.audio || typeof SP.audio.prepareWords !== 'function') { return; }
    var texts = [];
    words.forEach(function (word) {
      if (!canHear(word) || texts.length >= MAX_PREPARED_WORDS) { return; }
      var weak = word.errorType === 'Omission' ||
        (word.accuracy !== null && Math.round(word.accuracy) < SP.config.wordColors.green);
      if (weak && texts.indexOf(word.word) === -1) { texts.push(word.word); }
    });
    if (texts.length === 0) { return; }
    try { SP.audio.prepareWords(texts, voice); } catch (e) { /* the buttons still work */ }
  }

  // Draw one legend item with a color swatch.
  function buildLegendItem(colorClass, text) {
    var item = makeEl('span', 'sv-legend-item');
    item.appendChild(makeEl('span', 'sv-swatch ' + colorClass));
    item.appendChild(document.createTextNode(text));
    return item;
  }

  // Draw the legend line for the colors.
  function buildLegend(lang) {
    var colors = SP.config.wordColors;
    var legend = makeEl('div', 'sv-legend');
    legend.appendChild(buildLegendItem('sv-green', SP.t('svLegendGreen', lang, { n: colors.green })));
    legend.appendChild(buildLegendItem('sv-yellow', SP.t('svLegendYellow', lang, { a: colors.yellow, b: colors.green - 1 })));
    legend.appendChild(buildLegendItem('sv-red', SP.t('svLegendRed', lang, { n: colors.yellow })));
    return legend;
  }

  // Return true if the word list has an omitted word or an inserted word.
  function hasType(words, errorType) {
    return words.some(function (w) { return w.errorType === errorType; });
  }

  // Draw a short line that explains the marks, only for marks that are in the result.
  function buildMarkLegend(words, lang) {
    var parts = [];
    if (hasType(words, 'Omission')) { parts.push(SP.t('svLegendOmission', lang)); }
    if (hasType(words, 'Insertion')) { parts.push(SP.t('svLegendInsertion', lang)); }
    if (parts.length === 0) { return null; }
    return makeEl('div', 'sv-legend sv-marks', parts.join(' · '));
  }

  // ---------- Public function ----------

  // Clear the container and draw the score of a result.
  function render(container, result, lang, options) {
    var voice = (options && options.voice) || SP.config.defaultVoice;
    container.innerHTML = '';
    if (!result || !result.ok) {
      container.appendChild(makeEl('p', 'sv-error', SP.speech.errorText(result && result.error, lang)));
      return;
    }
    var root = makeEl('div', 'sv-root');
    root.appendChild(buildMainScore(result.scores, lang));

    var small = makeEl('div', 'sv-small-row');
    small.appendChild(buildSmallScore(SP.t('svAccuracy', lang), result.scores.accuracy));
    small.appendChild(buildSmallScore(SP.t('svFluency', lang), result.scores.fluency));
    root.appendChild(small);

    var words = result.words || [];
    if (words.length > 0) {
      root.appendChild(buildWords(words, lang, voice));
      root.appendChild(buildLegend(lang));
      var marks = buildMarkLegend(words, lang);
      if (marks) { root.appendChild(marks); }
    }
    container.appendChild(root);
    prepareWeakWords(words, voice);
  }

  SP.scoreView = { render: render };
}());
