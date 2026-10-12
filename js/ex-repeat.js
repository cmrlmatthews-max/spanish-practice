/* ex-repeat.js - the "repeat" exercise type, and the shared record flow.
 * The user hears a sentence and says it. Azure scores the recording.
 * ex-read-aloud.js reuses SP.recordFlow, so this file loads first.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.addText({
    en: {
      rpRecord: 'Record',
      rpCancel: 'Cancel',
      rpListening: 'Listening...',
      rpProcessing: 'Getting your score...',
      rpHintRepeat: 'Listen to the sentence. Then tap Record and say it.',
      rpUnavailable: 'The recording does not work. Reload the page and try again.'
    },
    es: {
      rpRecord: 'Grabar',
      rpCancel: 'Cancelar',
      rpListening: 'Escuchando…',
      rpProcessing: 'Calculando tu puntuación…',
      rpHintRepeat: 'Escucha la oración. Luego toca Grabar y dila.',
      rpUnavailable: 'La grabación no funciona. Vuelve a cargar la página e inténtalo de nuevo.'
    }
  });

  // Make an element with a class name and optional text.
  function makeElement(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text) { el.textContent = text; }
    return el;
  }

  // Build the record flow inside ctx.area. Return an object with cleanup().
  // hintKey is the text key of the short instruction above the Record button.
  function recordFlow(ctx, hintKey) {
    var current = null;     // the recording that is running now, or null
    var finished = false;   // true after ctx.finish was called
    var closed = false;     // true after cleanup was called

    var root = makeElement('div', 'rp-flow');
    var hint = makeElement('p', 'rp-hint note', ctx.t(hintKey));
    var button = makeElement('button', 'rp-record big', ctx.t('rpRecord'));
    button.type = 'button';
    var busy = makeElement('span', 'rp-busy');
    busy.setAttribute('aria-hidden', 'true');
    busy.hidden = true;
    var status = makeElement('p', 'rp-status status');
    status.setAttribute('role', 'status');
    var result = makeElement('div', 'rp-result');

    root.appendChild(hint);
    root.appendChild(button);
    root.appendChild(busy);
    root.appendChild(status);
    root.appendChild(result);
    ctx.area.appendChild(root);
    setState('idle');

    // Show one state: idle, listening, processing, or done.
    function setState(state) {
      root.setAttribute('data-state', state);
      var recording = (state === 'listening' || state === 'processing');
      button.textContent = ctx.t(recording ? 'rpCancel' : 'rpRecord');
      busy.hidden = !recording;
      button.hidden = (state === 'done');
      status.classList.remove('error');
      if (state === 'listening') { status.textContent = ctx.t('rpListening'); }
      else if (state === 'processing') { status.textContent = ctx.t('rpProcessing'); }
      else { status.textContent = ''; }
    }

    // Show an error text and let the user record again.
    function showError(text) {
      setState('idle');
      status.textContent = text;
      status.classList.add('error');
    }

    // Start a new recording.
    function start() {
      if (!SP.speech || typeof SP.speech.record !== 'function') {
        showError(ctx.t('rpUnavailable'));
        return;
      }
      if (SP.audio && typeof SP.audio.stop === 'function') { SP.audio.stop(); }
      result.innerHTML = '';
      setState('listening');
      var recording;
      try {
        recording = SP.speech.record(ctx.exercise.text, {
          onListening: function () { if (current === recording) { setState('listening'); } },
          onProcessing: function () { if (current === recording) { setState('processing'); } }
        });
      } catch (e) {
        showError(ctx.t('rpUnavailable'));
        return;
      }
      current = recording;
      recording.done.then(function (res) { handleResult(recording, res); });
    }

    // Cancel the recording that is running.
    function cancel() {
      var recording = current;
      current = null;
      if (recording) { recording.cancel(); }
      setState('idle');
    }

    // Use the result of one recording. Ignore a recording that is not current.
    function handleResult(recording, res) {
      if (closed || current !== recording) { return; }
      current = null;
      if (res && res.ok) { showScore(res); return; }
      var code = res && res.error;
      if (code === 'cancelled') { setState('idle'); return; }
      showError(SP.speech.errorText(code || 'other', ctx.lang));
    }

    // Show the score view and finish the exercise.
    function showScore(res) {
      setState('done');
      if (SP.scoreView) { SP.scoreView.render(result, res, ctx.lang); }
      if (finished) { return; }
      finished = true;
      ctx.finish({
        passed: SP.speech.passes(res, ctx.exercise),
        // Repeat shows no text before. The runner then shows the exact sentence with the score.
        textShown: hintKey !== 'rpHintRepeat',
        scores: {
          accuracy: res.scores.accuracy,
          fluency: res.scores.fluency,
          pron: res.scores.pron
        }
      });
    }

    // One tap starts a recording. A second tap cancels it.
    button.addEventListener('click', function () {
      if (finished || closed) { return; }
      if (current) { cancel(); } else { start(); }
    });

    // Stop everything when the runner leaves the exercise.
    function cleanup() {
      closed = true;
      var recording = current;
      current = null;
      if (recording) { recording.cancel(); }
    }

    return { cleanup: cleanup };
  }

  SP.recordFlow = recordFlow;

  SP.exerciseTypes = SP.exerciseTypes || {};
  SP.exerciseTypes.repeat = {
    // Show no Spanish text. The user hears the clip and then records.
    render: function (ctx) {
      return recordFlow(ctx, 'rpHintRepeat');
    }
  };
}());
