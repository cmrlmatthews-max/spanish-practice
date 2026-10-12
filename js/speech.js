/* speech.js - record one sentence and get a speech score from Azure.
 * SP.speech.record(text, callbacks) starts one single-shot recording.
 * SP.speech.passes(result, exercise) says if the result passes.
 * SP.speech.errorText(error, lang) gives a message for an error code.
 * The code never shows or logs raw Azure error details (they can hold the key).
 */
window.SP = window.SP || {};

SP.addText({
  en: {
    speechErrMic: 'The tool has no microphone permission. Allow the microphone for this page in the Safari settings. Then tap Record.',
    speechErrNospeech: 'The tool found no speech. Tap Record. Then speak.',
    speechErrNetwork: 'There is no network, or Azure cannot be reached. Check the connection. Then record again.',
    speechErrKey: 'The Azure key or the region is missing or wrong. Check both in Settings.',
    speechErrBusy: 'Azure has too many requests. Wait a few seconds. Then record again.',
    speechErrNoscores: 'Azure returned no scores for this recording. Record again.',
    speechErrCancelled: 'The recording stopped.',
    speechErrOther: 'The recording failed. Record again.'
  },
  es: {
    speechErrMic: 'La herramienta no tiene permiso para usar el micrófono. Permite el micrófono para esta página en los ajustes de Safari. Luego toca Grabar.',
    speechErrNospeech: 'No se escuchó ninguna voz. Toca Grabar y habla.',
    speechErrNetwork: 'No hay red, o no se puede conectar con Azure. Revisa la conexión y vuelve a grabar.',
    speechErrKey: 'Falta la clave o la región de Azure, o son incorrectas. Revisa ambas en Ajustes.',
    speechErrBusy: 'Azure tiene demasiadas solicitudes. Espera unos segundos y vuelve a grabar.',
    speechErrNoscores: 'Azure no devolvió puntuaciones para esta grabación. Vuelve a grabar.',
    speechErrCancelled: 'La grabación se detuvo.',
    speechErrOther: 'La grabación falló. Vuelve a grabar.'
  }
});

(function () {
  'use strict';

  // The recording that is active now. A new recording cancels it.
  var current = null;

  // ---------- Small helpers ----------

  // Return the value if it is a finite number. Return null if not.
  function numberOrNull(value) {
    return (typeof value === 'number' && isFinite(value)) ? value : null;
  }

  // Return the first value that is not null.
  function firstNumber(a, b) {
    return a !== null ? a : b;
  }

  // Read the key and the region from storage. Return null if one is missing.
  function getCredentials() {
    var key = String(SP.storage.getKey() || '').trim();
    var region = String(SP.storage.getRegion() || '').replace(/\s+/g, '').toLowerCase();
    if (!key || !region) { return null; }
    return { key: key, region: region };
  }

  // Turn an error text from the SDK or the browser into an error code.
  // The text is used only to choose the code. The page never shows it.
  function classifyText(raw) {
    var lower = String(raw == null ? '' : raw).toLowerCase();
    if (lower.indexOf('permission') !== -1 || lower.indexOf('notallowed') !== -1 ||
        lower.indexOf('microphone') !== -1 || lower.indexOf('notfound') !== -1) {
      return 'mic';
    }
    if (/status\w*\W*(401|403)/.test(lower) || lower.indexOf('authentication') !== -1 ||
        lower.indexOf('unauthorized') !== -1 || lower.indexOf('forbidden') !== -1) {
      return 'key';
    }
    if (/status\w*\W*429/.test(lower) || lower.indexOf('too many') !== -1 ||
        lower.indexOf('concurrent') !== -1 || lower.indexOf('throttl') !== -1) {
      return 'busy';
    }
    if (lower.indexOf('network') !== -1 || lower.indexOf('failed to fetch') !== -1 ||
        lower.indexOf('websocket') !== -1 || lower.indexOf('connection') !== -1 ||
        lower.indexOf('offline') !== -1) {
      return 'network';
    }
    return 'other';
  }

  // Turn a thrown error or an error callback value into an error code.
  function classifyError(err) {
    var text = '';
    if (err && typeof err === 'object' && err.message) { text = err.message; } else { text = err; }
    return classifyText(text);
  }

  // Turn a Canceled result into an error code.
  function cancelCode(result) {
    var SDK = window.SpeechSDK;
    var details = null;
    try { details = SDK.CancellationDetails.fromResult(result); } catch (e) { return 'other'; }
    var code = SDK.CancellationErrorCode;
    var errorCode = details ? details.ErrorCode : undefined;
    if (errorCode === code.AuthenticationFailure || errorCode === code.Forbidden) { return 'key'; }
    if (errorCode === code.TooManyRequests) { return 'busy'; }
    if (errorCode === code.ConnectionFailure) { return 'network'; }
    return classifyText(details ? details.errorDetails : '');
  }

  // ---------- Read the Azure result ----------

  // Parse the raw JSON of a result. Return null if it is missing or broken.
  function readRawJson(result) {
    try {
      var text = result.properties.getProperty(window.SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  // Read the SDK score object. Return null if the SDK cannot make it.
  function readAssessment(result) {
    try { return window.SpeechSDK.PronunciationAssessmentResult.fromResult(result); } catch (e) { return null; }
  }

  // Return the list of word objects from the SDK or from the raw JSON.
  function readWordList(assessment, best) {
    var list = null;
    try { list = assessment ? assessment.detailResult.Words : null; } catch (e) { list = null; }
    if (!Array.isArray(list) || list.length === 0) { list = best ? best.Words : null; }
    return Array.isArray(list) ? list : [];
  }

  // Make the word list of the tool from the Azure word list.
  function buildWords(list) {
    return list.map(function (w) {
      var pa = (w && w.PronunciationAssessment) || {};
      return {
        word: String(w && w.Word != null ? w.Word : ''),
        accuracy: numberOrNull(pa.AccuracyScore),
        errorType: String(pa.ErrorType || 'None')
      };
    });
  }

  // Make a Result from a RecognizedSpeech result.
  function buildResult(result) {
    var raw = readRawJson(result);
    var best = (raw && raw.NBest && raw.NBest[0]) || null;
    var rawScores = (best && best.PronunciationAssessment) || {};
    var assessment = readAssessment(result);
    var heard = String(result.text || '');

    var scores = {
      accuracy: firstNumber(numberOrNull(assessment && assessment.accuracyScore), numberOrNull(rawScores.AccuracyScore)),
      fluency: firstNumber(numberOrNull(assessment && assessment.fluencyScore), numberOrNull(rawScores.FluencyScore)),
      completeness: firstNumber(numberOrNull(assessment && assessment.completenessScore), numberOrNull(rawScores.CompletenessScore)),
      pron: firstNumber(numberOrNull(assessment && assessment.pronunciationScore), numberOrNull(rawScores.PronScore))
    };

    if (scores.accuracy === null || scores.fluency === null || scores.pron === null) {
      // No speech text and no scores means the user said nothing.
      return { ok: false, error: heard ? 'noscores' : 'nospeech' };
    }
    return {
      ok: true,
      scores: scores,
      words: buildWords(readWordList(assessment, best)),
      heard: heard
    };
  }

  // ---------- Record ----------

  // Start one recording. Return {cancel, done}. The done promise always resolves.
  function record(referenceText, callbacks) {
    var cb = callbacks || {};
    var settled = false;
    var recognizer = null;
    var audioConfig = null;
    var resolveDone = null;
    var done = new Promise(function (resolve) { resolveDone = resolve; });

    // Close the recognizer and the audio config. Ignore errors.
    function closeAll() {
      var r = recognizer;
      var a = audioConfig;
      recognizer = null;
      audioConfig = null;
      try { if (r) { r.close(); } } catch (e1) { /* ignore */ }
      try { if (a && a.close) { a.close(); } } catch (e2) { /* ignore */ }
    }

    // End the recording one time with a result. Later calls do nothing.
    function finish(result) {
      if (settled) { return; }
      settled = true;
      if (current === handle) { current = null; }
      closeAll();
      resolveDone(result);
    }

    // End the recording with an error code.
    function fail(code) {
      finish({ ok: false, error: code });
    }

    // Call a callback of the caller. An error in the callback changes nothing.
    function notify(name) {
      if (settled) { return; }
      try { if (typeof cb[name] === 'function') { cb[name](); } } catch (e) { /* ignore */ }
    }

    // Handle the result that Azure gives to recognizeOnceAsync.
    function handleResult(result) {
      var SDK = window.SpeechSDK;
      if (result.reason === SDK.ResultReason.NoMatch) { fail('nospeech'); return; }
      if (result.reason === SDK.ResultReason.Canceled) { fail(cancelCode(result)); return; }
      if (result.reason !== SDK.ResultReason.RecognizedSpeech) { fail('other'); return; }
      finish(buildResult(result));
    }

    // Build the recognizer and start. Throws an error if the SDK or the microphone fails.
    function start(creds) {
      var SDK = window.SpeechSDK;
      var speechConfig = SDK.SpeechConfig.fromSubscription(creds.key, creds.region);
      speechConfig.speechRecognitionLanguage = SP.config.language;
      if (typeof SP.config.silenceTimeoutMs === 'number') {
        speechConfig.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, String(SP.config.silenceTimeoutMs));
      }
      audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
      var mine = new SDK.SpeechRecognizer(speechConfig, audioConfig);
      recognizer = mine;

      // Scripted mode: the lesson sentence is the reference text. Scale 0-100. Miscue on.
      var assessmentConfig = new SDK.PronunciationAssessmentConfig(
        referenceText,
        SDK.PronunciationAssessmentGradingSystem.HundredMark,
        SDK.PronunciationAssessmentGranularity.Phoneme,
        true
      );
      assessmentConfig.applyTo(mine);

      // These callbacks work only for this recognizer. An old recording cannot change a new one.
      mine.speechEndDetected = function () {
        if (settled || recognizer !== mine) { return; }
        notify('onProcessing');
      };
      mine.recognizeOnceAsync(
        function (result) {
          if (settled || recognizer !== mine) { return; }
          try { handleResult(result); } catch (e) { fail('other'); }
        },
        function (err) {
          if (settled || recognizer !== mine) { return; }
          fail(classifyError(err));
        }
      );
      notify('onListening');
    }

    var handle = {
      // Cancel this recording. The done promise resolves with the error 'cancelled'.
      cancel: function () { fail('cancelled'); },
      done: done
    };

    // Only one recording can run at a time. Cancel the old one.
    if (current && current !== handle) { current.cancel(); }
    current = handle;

    var creds = getCredentials();
    if (!creds) {
      fail('key');
    } else if (!window.SpeechSDK) {
      fail('other');
    } else {
      try {
        start(creds);
      } catch (e) {
        fail(classifyError(e));
      }
    }
    return handle;
  }

  // ---------- Pass rule ----------

  // Return true if the result passes the pass values of the exercise.
  function passes(result, exercise) {
    if (!result || !result.ok || !result.scores) { return false; }
    var limits = (exercise && exercise.pass) || {};
    var accuracyMin = numberOrNull(limits.accuracy);
    var fluencyMin = numberOrNull(limits.fluency);
    if (accuracyMin === null) { accuracyMin = SP.config.pass.accuracy; }
    if (fluencyMin === null) { fluencyMin = SP.config.pass.fluency; }
    var omitted = (result.words || []).some(function (w) { return w.errorType === 'Omission'; });
    return result.scores.accuracy >= accuracyMin && result.scores.fluency >= fluencyMin && !omitted;
  }

  // ---------- Error text ----------

  var ERROR_KEYS = {
    mic: 'speechErrMic',
    nospeech: 'speechErrNospeech',
    network: 'speechErrNetwork',
    key: 'speechErrKey',
    busy: 'speechErrBusy',
    noscores: 'speechErrNoscores',
    cancelled: 'speechErrCancelled',
    other: 'speechErrOther'
  };

  // Return the message for an error code in a language.
  function errorText(error, lang) {
    return SP.t(ERROR_KEYS[error] || ERROR_KEYS.other, lang);
  }

  SP.speech = {
    record: record,
    passes: passes,
    errorText: errorText
  };
}());
