/* ex-listen-type.js - exercise type "listen_type".
 * The audio plays. The user types the sentence.
 * The tool ignores accent marks, capital letters, and punctuation.
 * The tilde of the letter n (ñ) stays: "nino" is not "niño".
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.addText({
    en: {
      ltPrompt: 'Listen. Then type the sentence.',
      ltLabel: 'Your answer',
      ltCheck: 'Check',
      ltYourAnswer: 'Your answer:',
      ltCorrectSpelling: 'Correct spelling:',
      ltSpellingDiffers: 'Your answer is correct. The accent marks, capital letters, or punctuation are different.'
    },
    es: {
      ltPrompt: 'Escucha. Luego escribe la oración.',
      ltLabel: 'Tu respuesta',
      ltCheck: 'Revisar',
      ltYourAnswer: 'Tu respuesta:',
      ltCorrectSpelling: 'Escritura correcta:',
      ltSpellingDiffers: 'Tu respuesta es correcta. Los acentos, las mayúsculas o la puntuación son diferentes.'
    }
  });

  // Make a text ready for comparison.
  // Steps: lower case, remove acute accent and diaeresis, keep the tilde of ñ,
  // replace punctuation with a space, collapse spaces, trim.
  function normalizeAnswer(text) {
    var result = String(text == null ? '' : text).toLowerCase();
    result = result.normalize('NFD');
    result = result.replace(/[́̈]/g, '');
    result = result.normalize('NFC');
    result = result.replace(/[\p{P}\p{S}]/gu, ' ');
    result = result.replace(/\s+/g, ' ');
    return result.trim();
  }

  // Return true if the answer matches the correct text after normalization.
  function answerMatches(answer, correctText) {
    return normalizeAnswer(answer) === normalizeAnswer(correctText);
  }

  // Make one line of feedback text, for example "Your answer: gracias".
  function makeLine(label, value) {
    var line = document.createElement('p');
    line.className = 'lt-line';
    var labelEl = document.createElement('span');
    labelEl.className = 'lt-line-label';
    labelEl.textContent = label + ' ';
    var valueEl = document.createElement('span');
    valueEl.className = 'lt-line-value';
    valueEl.lang = 'es';
    valueEl.textContent = value;
    line.appendChild(labelEl);
    line.appendChild(valueEl);
    return line;
  }

  // Draw the exercise into ctx.area.
  function render(ctx) {
    var finished = false;
    ctx.area.innerHTML = '';

    var prompt = document.createElement('p');
    prompt.className = 'lt-prompt';
    prompt.textContent = ctx.t('ltPrompt');
    ctx.area.appendChild(prompt);

    var form = document.createElement('div');
    form.className = 'lt-form';
    ctx.area.appendChild(form);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'lt-input';
    input.lang = 'es';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', ctx.t('ltLabel'));
    input.spellcheck = false;
    form.appendChild(input);

    var checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'lt-check';
    checkButton.textContent = ctx.t('ltCheck');
    form.appendChild(checkButton);

    var feedback = document.createElement('div');
    feedback.className = 'lt-feedback';
    feedback.setAttribute('role', 'status');
    ctx.area.appendChild(feedback);

    // Show the answer, the note about spelling, and the correct spelling.
    function showFeedback(answer, passed) {
      var correctText = ctx.exercise.text;
      feedback.innerHTML = '';
      feedback.appendChild(makeLine(ctx.t('ltYourAnswer'), answer));
      if (passed && answer === correctText) { return; }
      if (passed) {
        var info = document.createElement('p');
        info.className = 'lt-info';
        info.textContent = ctx.t('ltSpellingDiffers');
        feedback.appendChild(info);
      }
      feedback.appendChild(makeLine(ctx.t('ltCorrectSpelling'), correctText));
    }

    // Check the answer one time.
    function check() {
      if (finished) { return; }
      var answer = input.value.trim();
      if (answer === '') { return; }
      finished = true;
      var passed = answerMatches(answer, ctx.exercise.text);
      input.disabled = true;
      checkButton.disabled = true;
      showFeedback(answer, passed);
      ctx.finish({ passed: passed, textShown: true });
    }

    checkButton.addEventListener('click', check);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        check();
      }
    });

    return {
      // Nothing runs in the background, so nothing needs a stop.
      cleanup: function () { finished = true; }
    };
  }

  SP.exerciseTypes = SP.exerciseTypes || {};
  SP.exerciseTypes.listen_type = { render: render, normalizeAnswer: normalizeAnswer, answerMatches: answerMatches };
})();
