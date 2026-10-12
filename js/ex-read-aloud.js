/* ex-read-aloud.js - the "read_aloud" exercise type.
 * The page shows the Spanish sentence. The user reads it aloud. Azure scores the recording.
 * This file uses SP.recordFlow from ex-repeat.js, which loads first.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.addText({
    en: {
      raHint: 'Tap Record and read the sentence aloud.',
      raUnavailable: 'This exercise needs a file that is missing. Reload the page and try again.'
    },
    es: {
      raHint: 'Toca Grabar y lee la oración en voz alta.',
      raUnavailable: 'Este ejercicio necesita un archivo que falta. Vuelve a cargar la página e inténtalo de nuevo.'
    }
  });

  SP.exerciseTypes = SP.exerciseTypes || {};
  SP.exerciseTypes.read_aloud = {
    // Show the sentence in large text. Then start the shared record flow.
    render: function (ctx) {
      if (typeof SP.recordFlow !== 'function') {
        var problem = document.createElement('p');
        problem.className = 'status error';
        problem.textContent = ctx.t('raUnavailable');
        ctx.area.appendChild(problem);
        return { cleanup: function () {} };
      }
      var sentence = document.createElement('p');
      sentence.className = 'ra-text';
      sentence.lang = 'es';
      sentence.textContent = ctx.exercise.text;
      ctx.area.appendChild(sentence);
      return SP.recordFlow(ctx, 'raHint');
    }
  };
}());
