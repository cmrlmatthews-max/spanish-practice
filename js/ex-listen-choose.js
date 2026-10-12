/* ex-listen-choose.js - exercise type "listen_choose".
 * The audio plays. The user taps one of four images.
 * No text shows before the correct choice.
 */
window.SP = window.SP || {};

(function () {
  'use strict';

  SP.addText({
    en: {
      lcPrompt: 'Listen. Then tap the correct picture.',
      lcOption: 'Picture {n}',
      lcCorrectMark: 'Correct',
      lcWrongMark: 'Not correct'
    },
    es: {
      lcPrompt: 'Escucha. Luego toca la imagen correcta.',
      lcOption: 'Imagen {n}',
      lcCorrectMark: 'Correcta',
      lcWrongMark: 'Incorrecta'
    }
  });

  // Return a shuffled copy of a list (Fisher-Yates).
  function shuffled(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  // Make one image button for one choice.
  function makeButton(choice, number, ctx) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'lc-choice';
    button.setAttribute('aria-label', ctx.t('lcOption', { n: number }));

    var img = document.createElement('img');
    img.className = 'lc-image';
    img.src = choice.image;
    img.alt = '';
    img.draggable = false;
    button.appendChild(img);
    return button;
  }

  // Draw the exercise into ctx.area.
  function render(ctx) {
    var choices = shuffled(ctx.exercise.choices || []);
    var buttons = [];
    var wrongCount = 0;
    var finished = false;

    ctx.area.innerHTML = '';

    var prompt = document.createElement('p');
    prompt.className = 'lc-prompt';
    prompt.textContent = ctx.t('lcPrompt');
    ctx.area.appendChild(prompt);

    var grid = document.createElement('div');
    grid.className = 'lc-grid';
    ctx.area.appendChild(grid);

    // Disable all buttons.
    function disableAll() {
      buttons.forEach(function (button) { button.disabled = true; });
    }

    // Handle a tap on a wrong image: dim it and play the audio again.
    function handleWrong(button) {
      wrongCount += 1;
      button.disabled = true;
      button.classList.add('lc-wrong');
      button.setAttribute('aria-label', button.getAttribute('aria-label') + '. ' + ctx.t('lcWrongMark'));
      ctx.playAudio(false);
    }

    // Handle a tap on the correct image: finish the exercise.
    function handleCorrect(button) {
      finished = true;
      disableAll();
      button.classList.add('lc-correct');
      button.setAttribute('aria-label', button.getAttribute('aria-label') + '. ' + ctx.t('lcCorrectMark'));
      ctx.finish({ passed: wrongCount === 0, textShown: false });
    }

    choices.forEach(function (choice, index) {
      var button = makeButton(choice, index + 1, ctx);
      button.addEventListener('click', function () {
        if (finished) { return; }
        if (choice.correct === true) { handleCorrect(button); } else { handleWrong(button); }
      });
      buttons.push(button);
      grid.appendChild(button);
    });

    return {
      // Nothing runs in the background, so nothing needs a stop.
      cleanup: function () { finished = true; }
    };
  }

  SP.exerciseTypes = SP.exerciseTypes || {};
  SP.exerciseTypes.listen_choose = { render: render };
})();
