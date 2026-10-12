/* Spanish test page - test.js
 * Function 1: record one sentence, send it to Azure, show all returned results.
 * Function 2: play one sentence in each voice, at normal speed and at 0.85 speed.
 * Plain JavaScript. The Azure SDK file loads before this file (js/vendor/).
 * The key stays in the storage of this browser. The code never logs the key.
 */
(function () {
  'use strict';

  var SDK = window.SpeechSDK;

  // ---------- Constants ----------
  var LANG = 'es-MX';
  var PASS_ACCURACY = 75;
  var PASS_FLUENCY = 70;
  var STORE_KEY = 'spanish-azure-key';
  var STORE_REGION = 'spanish-azure-region';
  var STORE_PROFILE = 'spanish-test-profile';
  var STORE_LOG = 'spanish-test-log';

  // Five test sentences for each person.
  var SENTENCES = {
    cade: [
      'Buenos días, necesito un taxi.',
      '¿Dónde está el baño, por favor?',
      'Quiero un café con leche.',
      'La reunión es a las tres de la tarde.',
      'Voy a revisar los planos del edificio.'
    ],
    casey: [
      'Mañana por la mañana tengo que llegar temprano a la oficina para revisar los documentos del proyecto.',
      'Me gustaría reservar una habitación doble para tres noches, con desayuno incluido y vista al mar.',
      'Erre con erre cigarro, erre con erre barril; rápido ruedan los carros cargados de azúcar al ferrocarril.',
      'Aunque el vuelo salió con retraso, llegamos al hotel a tiempo y pudimos cenar con nuestros amigos esa misma noche.',
      'Es importante que todos los ingenieros revisen los cálculos antes de que el cliente apruebe el presupuesto final.'
    ]
  };

  // ---------- Small helpers ----------
  function $(id) { return document.getElementById(id); }

  function store(name, value) {
    try {
      if (value === null) { localStorage.removeItem(name); } else { localStorage.setItem(name, value); }
      return true;
    } catch (e) { return false; }
  }
  function load(name) {
    try { return localStorage.getItem(name); } catch (e) { return null; }
  }

  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // Remove the key from any text before the page shows the text.
  function redact(text) {
    var s = String(text == null ? '' : text);
    var key = load(STORE_KEY);
    if (key && key.length > 5) { s = s.split(key).join('[key hidden]'); }
    return s;
  }

  function setStatus(el, text, isError) {
    el.textContent = text || '';
    if (isError) { el.classList.add('error'); } else { el.classList.remove('error'); }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getCredentials() {
    var key = (load(STORE_KEY) || '').trim();
    var region = (load(STORE_REGION) || '').replace(/\s+/g, '').toLowerCase();
    if (!key || !region) { return null; }
    return { key: key, region: region };
  }

  // Turn an error text from Azure or the browser into a clear message.
  function explainError(raw) {
    var t = redact(raw);
    var lower = t.toLowerCase();
    if (lower.indexOf('permission') !== -1 || lower.indexOf('notallowed') !== -1 ||
        (lower.indexOf('denied') !== -1 && lower.indexOf('microphone') !== -1)) {
      return 'No microphone permission. Allow the microphone for this page in Safari, then tap Record again.';
    }
    if (/status\w*\W*(401|403)/.test(lower) || lower.indexOf('authentication') !== -1 || lower.indexOf('unauthorized') !== -1 ||
        lower.indexOf('forbidden') !== -1) {
      return 'Azure did not accept the key or the region. Check both in Settings.';
    }
    if (/status\w*\W*429/.test(lower) || lower.indexOf('too many') !== -1 ||
        lower.indexOf('concurrent') !== -1 || lower.indexOf('throttl') !== -1) {
      return 'Too many requests. Wait 10 seconds. Then try again.';
    }
    if (lower.indexOf('network') !== -1 || lower.indexOf('failed to fetch') !== -1 ||
        lower.indexOf('websocket') !== -1 || lower.indexOf('connection') !== -1 ||
        lower.indexOf('offline') !== -1) {
      return 'No network, or Azure cannot be reached. Check the connection and the region. Then try again.';
    }
    return 'Error: ' + t;
  }

  // ---------- Settings ----------
  function initSettings() {
    // The key is not put back in the field. The field shows only that a key exists.
    function showKeyState() {
      $('azureKey').value = '';
      $('azureKey').placeholder = load(STORE_KEY) ? 'Key saved on this device' : 'Paste the key here';
    }
    showKeyState();
    $('azureRegion').value = load(STORE_REGION) || '';

    $('saveSettings').addEventListener('click', function () {
      var key = $('azureKey').value.trim() || (load(STORE_KEY) || '');
      var region = $('azureRegion').value.replace(/\s+/g, '').toLowerCase();
      var status = $('settingsStatus');
      if (!key || !region) {
        setStatus(status, 'Type the key and the region. Then tap Save.', true);
        return;
      }
      var okKey = store(STORE_KEY, key);
      var okRegion = store(STORE_REGION, region);
      if (okKey && okRegion) {
        showKeyState();
        $('azureRegion').value = region;
        setStatus(status, 'Saved on this device.');
      } else {
        setStatus(status, 'Safari did not save the settings. Turn off Private Browsing and try again.', true);
      }
    });

    $('clearKey').addEventListener('click', function () {
      store(STORE_KEY, null);
      showKeyState();
      setStatus($('settingsStatus'), 'The key is gone from this device.');
    });

    var profile = load(STORE_PROFILE);
    if (profile === 'cade' || profile === 'casey') { $('profile').value = profile; }
    $('profile').addEventListener('change', function () {
      store(STORE_PROFILE, $('profile').value);
      fillSentences();
    });
  }

  // ---------- Sentence lists ----------
  function fillSentences() {
    var list = SENTENCES[$('profile').value];
    ['sentence', 'voiceSentence'].forEach(function (id) {
      var sel = $(id);
      sel.innerHTML = '';
      list.forEach(function (text, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = (i + 1) + '. ' + text;
        sel.appendChild(opt);
      });
    });
    showSentence();
    resetVoices();
  }

  function currentSentence() {
    return SENTENCES[$('profile').value][Number($('sentence').value) || 0];
  }

  function showSentence() {
    var text = currentSentence();
    $('sentenceText').textContent = text;
    $('sentenceCount').textContent = 'Words: ' + countWords(text);
  }

  // ---------- Function 1: record and score ----------
  var rec = {
    active: false,
    recognizer: null,
    audioConfig: null,
    tTap: 0,
    tSpeechEnd: 0,
    finished: false
  };

  function closeRecognizer() {
    try { if (rec.recognizer) { rec.recognizer.close(); } } catch (e) { /* ignore */ }
    try { if (rec.audioConfig && rec.audioConfig.close) { rec.audioConfig.close(); } } catch (e2) { /* ignore */ }
    rec.recognizer = null;
    rec.audioConfig = null;
  }

  function setRecordingUi(on) {
    var btn = $('recordBtn');
    rec.active = on;
    btn.textContent = on ? 'Recording… tap to cancel' : 'Record';
    if (on) { btn.classList.add('recording'); } else { btn.classList.remove('recording'); }
    $('busy').hidden = true;
    $('sentence').disabled = on;
    $('silenceMs').disabled = on;
    $('profile').disabled = on;
  }

  function finishWithError(message) {
    if (rec.finished) { return; }
    rec.finished = true;
    closeRecognizer();
    setRecordingUi(false);
    setStatus($('recordStatus'), message, true);
  }

  function startRecording() {
    var creds = getCredentials();
    if (!creds) {
      setStatus($('recordStatus'), 'The key or the region is missing. Type both in Settings. Then tap Save.', true);
      $('settings').scrollIntoView();
      return;
    }
    if (!SDK) {
      setStatus($('recordStatus'), 'The Azure file did not load. Reload the page.', true);
      return;
    }

    var refText = currentSentence();
    rec.finished = false;
    rec.tSpeechEnd = 0;
    $('resultBox').hidden = true;
    setStatus($('recordStatus'), 'Allow the microphone if Safari asks. Then say the sentence.');
    setRecordingUi(true);

    var recognizer;
    try {
      var speechConfig = SDK.SpeechConfig.fromSubscription(creds.key, creds.region);
      speechConfig.speechRecognitionLanguage = LANG;
      var silence = $('silenceMs').value;
      if (silence) {
        speechConfig.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, silence);
      }
      rec.audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
      recognizer = new SDK.SpeechRecognizer(speechConfig, rec.audioConfig);

      // Scripted mode: the lesson sentence is the reference text. Scale 0-100. Miscue on.
      var pa = new SDK.PronunciationAssessmentConfig(
        refText,
        SDK.PronunciationAssessmentGradingSystem.HundredMark,
        SDK.PronunciationAssessmentGranularity.Phoneme,
        true
      );
      pa.applyTo(recognizer);
    } catch (e) {
      finishWithError(explainError(e && e.message ? e.message : e));
      return;
    }

    rec.recognizer = recognizer;
    rec.tTap = performance.now();

    var mine = recognizer; // callbacks of an old recording must not change a new recording
    recognizer.speechEndDetected = function () {
      if (rec.recognizer !== mine) { return; }
      rec.tSpeechEnd = performance.now();
      if (!rec.finished) {
        $('busy').hidden = false;
      }
    };

    // Single-shot recognition: one result for one sentence.
    recognizer.recognizeOnceAsync(
      function (result) {
        if (rec.finished || rec.recognizer !== mine) { return; }
        var tDone = performance.now();
        rec.finished = true;
        closeRecognizer();
        setRecordingUi(false);
        handleResult(result, refText, tDone);
      },
      function (err) {
        if (rec.recognizer !== mine) { return; }
        finishWithError(explainError(err));
      }
    );
  }

  function cancelRecording() {
    if (rec.finished) { return; }
    rec.finished = true;
    closeRecognizer();
    setRecordingUi(false);
    setStatus($('recordStatus'), 'Recording cancelled.');
  }

  function handleResult(result, refText, tDone) {
    var R = SDK.ResultReason;

    if (result.reason === R.NoMatch) {
      setStatus($('recordStatus'), 'No speech found. Tap Record. Then speak after the tap.', true);
      return;
    }

    if (result.reason === R.Canceled) {
      var details = SDK.CancellationDetails.fromResult(result);
      var code = SDK.CancellationErrorCode;
      var message;
      if (details.ErrorCode === code.AuthenticationFailure || details.ErrorCode === code.Forbidden) {
        message = 'Azure did not accept the key or the region. Check both in Settings.';
      } else if (details.ErrorCode === code.TooManyRequests) {
        message = 'Too many requests. Wait 10 seconds. Then record again.';
      } else if (details.ErrorCode === code.ConnectionFailure) {
        message = 'No network, or Azure cannot be reached. Check the connection and the region. Then record again.';
      } else {
        message = explainError(details.errorDetails || 'The recording stopped with an error.');
      }
      setStatus($('recordStatus'), message, true);
      return;
    }

    if (result.reason !== R.RecognizedSpeech) {
      setStatus($('recordStatus'), 'Unexpected result from Azure. Record again.', true);
      return;
    }

    setStatus($('recordStatus'), 'Done.');
    showScores(result, refText, tDone);
  }

  function colorClass(score) {
    if (score >= 80) { return 'green'; }
    if (score >= 60) { return 'yellow'; }
    return 'red';
  }

  function fmtMs(ms) {
    return (ms / 1000).toFixed(1) + ' s';
  }

  function showScores(result, refText, tDone) {
    // Raw JSON from Azure. This shows all returned results.
    var rawText = '';
    try {
      rawText = result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult) || '';
    } catch (e) { rawText = ''; }
    var raw = null;
    try { raw = JSON.parse(rawText); } catch (e2) { raw = null; }
    $('rawJson').textContent = raw ? JSON.stringify(raw, null, 2) : (rawText || '(no JSON returned)');

    var pr = null;
    try { pr = SDK.PronunciationAssessmentResult.fromResult(result); } catch (e3) { pr = null; }

    var accuracy = pr ? pr.accuracyScore : undefined;
    var fluency = pr ? pr.fluencyScore : undefined;
    var completeness = pr ? pr.completenessScore : undefined;
    var pron = pr ? pr.pronunciationScore : undefined;

    var hasScores = typeof accuracy === 'number' && typeof pron === 'number';
    var warning = $('scoreWarning');
    if (!hasScores) {
      warning.hidden = false;
      warning.textContent = 'Azure returned text but no pronunciation scores. Write this in the results form, question 1.';
    } else {
      warning.hidden = true;
    }

    // Words
    var words = [];
    try { words = pr ? (pr.detailResult.Words || []) : []; } catch (e4) { words = []; }
    if (!words.length && raw && raw.NBest && raw.NBest[0] && raw.NBest[0].Words) {
      words = raw.NBest[0].Words;
    }

    var omitted = 0;
    var inserted = 0;
    var box = $('words');
    box.innerHTML = '';
    var wordLog = [];
    words.forEach(function (w) {
      var wpa = w.PronunciationAssessment || {};
      var score = typeof wpa.AccuracyScore === 'number' ? wpa.AccuracyScore : null;
      var errType = wpa.ErrorType || 'None';
      if (errType === 'Omission') { omitted += 1; }
      if (errType === 'Insertion') { inserted += 1; }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word ' + (score === null ? '' : colorClass(score));
      if (errType === 'Omission') { btn.classList.add('omitted'); }
      if (errType === 'Insertion') { btn.classList.add('inserted'); }
      btn.textContent = w.Word;

      var phonemes = (w.Phonemes || []).map(function (p) {
        var s = p.PronunciationAssessment && p.PronunciationAssessment.AccuracyScore;
        return typeof s === 'number' ? Math.round(s) : '?';
      });
      btn.addEventListener('click', function () {
        var text = w.Word + ': score ' + (score === null ? 'none' : Math.round(score)) +
          '. Error type: ' + errType + '.';
        if (phonemes.length) { text += ' Sound scores: ' + phonemes.join(', ') + '.'; }
        setStatus($('wordDetail'), text);
      });
      box.appendChild(btn);
      wordLog.push({ w: w.Word, s: score === null ? null : Math.round(score), e: errType });
    });
    setStatus($('wordDetail'), '');

    // Pass or fail
    var pass = hasScores && accuracy >= PASS_ACCURACY && fluency >= PASS_FLUENCY && omitted === 0;
    var verdict = $('verdict');
    if (!hasScores) {
      verdict.textContent = 'No score.';
      verdict.className = 'verdict fail';
    } else {
      verdict.textContent = pass ? 'Pass' : 'Fail';
      verdict.className = 'verdict ' + (pass ? 'pass' : 'fail');
    }

    function num(v) { return typeof v === 'number' ? String(Math.round(v)) : '-'; }
    $('sPron').textContent = num(pron);
    $('sAcc').textContent = num(accuracy);
    $('sFlu').textContent = num(fluency);
    $('sCom').textContent = num(completeness);
    $('sOmit').textContent = String(omitted);
    $('sIns').textContent = String(inserted);
    $('sWords').textContent = String(countWords(refText));

    var totalMs = tDone - rec.tTap;
    var waitMs = rec.tSpeechEnd ? (tDone - rec.tSpeechEnd) : null;
    var audioSec = typeof result.duration === 'number' ? result.duration / 10000000 : null;
    $('tTotal').textContent = fmtMs(totalMs);
    $('tWait').textContent = waitMs === null ? 'not measured' : fmtMs(waitMs);
    $('tAudio').textContent = audioSec === null ? '-' : audioSec.toFixed(1) + ' s';

    $('heard').textContent = result.text || '';
    $('resultBox').hidden = false;
    $('resultBox').scrollIntoView();

    addLog({
      time: new Date().toISOString(),
      profile: $('profile').value,
      sentence: Number($('sentence').value) + 1,
      wordsInSentence: countWords(refText),
      silenceMs: $('silenceMs').value || 'default',
      hasScores: hasScores,
      pron: hasScores ? Math.round(pron) : null,
      accuracy: hasScores ? Math.round(accuracy) : null,
      fluency: hasScores ? Math.round(fluency) : null,
      completeness: hasScores ? Math.round(completeness) : null,
      omitted: omitted,
      inserted: inserted,
      pass: pass,
      secondsTapToResult: Number((totalMs / 1000).toFixed(1)),
      secondsSpeechEndToResult: waitMs === null ? null : Number((waitMs / 1000).toFixed(1)),
      audioSeconds: audioSec === null ? null : Number(audioSec.toFixed(1)),
      heard: result.text || '',
      wordScores: wordLog,
      device: navigator.userAgent,
      standalone: window.navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    });
  }

  // ---------- Log ----------
  var logEntries = [];

  function loadLog() {
    var text = load(STORE_LOG);
    if (!text) { return; }
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) { logEntries = parsed; }
    } catch (e) { logEntries = []; }
  }

  function addLog(entry) {
    logEntries.push(entry);
    store(STORE_LOG, JSON.stringify(logEntries));
    updateLogCount();
  }

  function updateLogCount() {
    $('logCount').textContent = 'Lines in the log: ' + logEntries.length;
  }

  function copyLog() {
    var text = JSON.stringify(logEntries, null, 2);
    var area = $('logText');
    area.value = text;
    area.hidden = false;
    var status = $('logStatus');

    function fallback() {
      area.focus();
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      setStatus(status, ok ? 'Copied.' : 'Copy failed. Hold your finger on the text, then tap Select All and Copy.', !ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { setStatus(status, 'Copied.'); },
        fallback
      );
    } else {
      fallback();
    }
  }

  function clearLog() {
    logEntries = [];
    store(STORE_LOG, null);
    $('logText').value = '';
    $('logText').hidden = true;
    updateLogCount();
    setStatus($('logStatus'), 'Log cleared.');
  }

  // ---------- Function 2: voices ----------
  var clips = {}; // voice name -> ArrayBuffer for the loaded sentence
  var currentUrl = null;

  function resetVoices() {
    clips = {};
    setStatus($('voiceStatus'), '');
    var buttons = document.querySelectorAll('button.play');
    for (var i = 0; i < buttons.length; i++) { buttons[i].disabled = true; }
  }

  // Get one voice clip from Azure. Retry up to three times on "too many requests".
  async function synthesize(text, voice, creds) {
    var delays = [2000, 4000, 8000];
    for (var attempt = 0; attempt <= delays.length; attempt++) {
      var outcome = await new Promise(function (resolve) {
        var cfg = SDK.SpeechConfig.fromSubscription(creds.key, creds.region);
        cfg.speechSynthesisVoiceName = voice;
        cfg.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        var synth = new SDK.SpeechSynthesizer(cfg, null); // null: no auto play, we get the data
        synth.speakTextAsync(
          text,
          function (res) {
            var ok = res.reason === SDK.ResultReason.SynthesizingAudioCompleted;
            var data = ok ? res.audioData : null;
            var errText = ok ? '' : (res.errorDetails || 'Voice request failed.');
            var tooMany = false;
            if (!ok) {
              try {
                tooMany = SDK.CancellationDetails.fromResult(res).ErrorCode === SDK.CancellationErrorCode.TooManyRequests;
              } catch (e) { tooMany = false; }
            }
            synth.close();
            resolve({ ok: ok, data: data, error: errText, tooMany: tooMany });
          },
          function (err) {
            synth.close();
            resolve({ ok: false, data: null, error: String(err) });
          }
        );
      });
      if (outcome.ok) { return outcome.data; }
      var lower = redact(outcome.error).toLowerCase();
      var tooMany = outcome.tooMany || lower.indexOf('too many') !== -1 || /status\w*\W*429|\b429\b.*too many/.test(lower);
      if (tooMany && attempt < delays.length) {
        setStatus($('voiceStatus'), 'Azure says too many requests. Waiting ' + (delays[attempt] / 1000) + ' seconds…');
        await sleep(delays[attempt]);
        continue;
      }
      throw new Error(outcome.error);
    }
    throw new Error('429 Too many requests');
  }

  async function loadVoices() {
    var creds = getCredentials();
    var status = $('voiceStatus');
    if (!creds) {
      setStatus(status, 'The key or the region is missing. Type both in Settings. Then tap Save.', true);
      $('settings').scrollIntoView();
      return;
    }
    if (!SDK) {
      setStatus(status, 'The Azure file did not load. Reload the page.', true);
      return;
    }
    var text = SENTENCES[$('profile').value][Number($('voiceSentence').value) || 0];
    var loadBtn = $('loadVoices');
    loadBtn.disabled = true;
    $('voiceSentence').disabled = true;
    $('profile').disabled = true;
    resetVoices();
    setStatus(status, 'Loading the voices…');
    try {
      clips['es-MX-DaliaNeural'] = await synthesize(text, 'es-MX-DaliaNeural', creds);
      clips['es-MX-JorgeNeural'] = await synthesize(text, 'es-MX-JorgeNeural', creds);
      var buttons = document.querySelectorAll('button.play');
      for (var i = 0; i < buttons.length; i++) { buttons[i].disabled = false; }
      setStatus(status, 'Voices ready. Tap a play button.');
    } catch (e) {
      clips = {};
      setStatus(status, explainError(e && e.message ? e.message : e), true);
    }
    loadBtn.disabled = false;
    $('voiceSentence').disabled = false;
    $('profile').disabled = false;
  }

  // Each play starts from a tap. Safari blocks sound that does not start from a tap.
  function playClip(voice, rate) {
    var data = clips[voice];
    if (!data) { return; }
    var player = $('player');
    if (currentUrl) { URL.revokeObjectURL(currentUrl); }
    currentUrl = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    player.src = currentUrl;
    player.defaultPlaybackRate = rate;
    player.playbackRate = rate;
    if ('preservesPitch' in player) { player.preservesPitch = true; }
    if ('webkitPreservesPitch' in player) { player.webkitPreservesPitch = true; }
    var p = player.play();
    if (p && p.catch) {
      p.catch(function (e) {
        setStatus($('voiceStatus'), 'The browser did not play the sound: ' + redact(e && e.message ? e.message : e), true);
      });
    }
  }

  // ---------- Start ----------
  function init() {
    initSettings();
    loadLog();
    updateLogCount();
    fillSentences();

    $('sentence').addEventListener('change', showSentence);
    $('recordBtn').addEventListener('click', function () {
      if (rec.active) { cancelRecording(); } else { startRecording(); }
    });

    $('voiceSentence').addEventListener('change', resetVoices);
    $('loadVoices').addEventListener('click', loadVoices);
    var plays = document.querySelectorAll('button.play');
    for (var i = 0; i < plays.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          playClip(btn.getAttribute('data-voice'), Number(btn.getAttribute('data-rate')) || 1);
        });
      })(plays[i]);
    }

    $('copyLog').addEventListener('click', copyLog);
    $('clearLog').addEventListener('click', clearLog);

    if (!SDK) {
      setStatus($('recordStatus'), 'The Azure file did not load. Check js/vendor/ and reload the page.', true);
    }
  }

  init();
})();
