/* audio.js - voice clips: get them from Azure, keep them, and play them.
 * SP.audio.prepareLesson loads all clips of a lesson before the first exercise.
 * SP.audio.play starts a clip at once. Safari needs the call inside a tap.
 * The code never shows the Azure key or the raw error details of the SDK.
 */
window.SP = window.SP || {};

SP.addText({
  en: {
    audioErrKey: 'Azure did not accept the key or the region. Check both in Settings.',
    audioErrNetwork: 'The tool cannot reach Azure. Check the network. Then try again.',
    audioErrBusy: 'Azure has too many requests now. Wait a few seconds. Then try again.',
    audioErrOther: 'The tool cannot load the voices. Try again.'
  },
  es: {
    audioErrKey: 'Azure no aceptó la clave o la región. Revisa las dos en Ajustes.',
    audioErrNetwork: 'La herramienta no puede conectarse con Azure. Revisa la red e inténtalo de nuevo.',
    audioErrBusy: 'Azure tiene demasiadas solicitudes en este momento. Espera unos segundos e inténtalo de nuevo.',
    audioErrOther: 'La herramienta no puede cargar las voces. Inténtalo de nuevo.'
  }
});

(function () {
  'use strict';

  var DB_NAME = SP.config.storagePrefix + 'clips';
  var STORE_NAME = 'clips';
  var DB_OPEN_TIMEOUT_MS = 4000;

  // The shared audio element. The code creates it at the first play.
  var player = null;
  // Object URLs of the prepared clips. Key: clip id.
  var urls = {};
  // Clips that IndexedDB could not keep. Key: clip id. Value: Blob.
  var memoryBlobs = {};
  // The open database as a promise. It resolves to null if IndexedDB does not work.
  var dbPromise = null;

  // ---------- Clip ids ----------

  // Return true if the exercise type plays a voice clip.
  function needsAudio(exercise) {
    return !!exercise && SP.config.audioTypes.indexOf(exercise.type) !== -1;
  }

  // Return the voice name of an exercise.
  function voiceOf(exercise) {
    return exercise.voice || SP.config.defaultVoice;
  }

  // Return the clip id of an exercise: voice name, a bar, and the text.
  function clipId(exercise) {
    return voiceOf(exercise) + '|' + exercise.text;
  }

  // Return the list of different clips that a lesson needs: {id, voice, text}.
  function clipsOfLesson(lesson) {
    var list = [];
    var seen = {};
    var exercises = (lesson && lesson.exercises) || [];
    exercises.forEach(function (exercise) {
      if (!needsAudio(exercise)) { return; }
      var id = clipId(exercise);
      if (seen[id]) { return; }
      seen[id] = true;
      list.push({ id: id, voice: voiceOf(exercise), text: exercise.text });
    });
    return list;
  }

  // ---------- IndexedDB (never throws, never rejects) ----------

  // Open the database one time. Resolve to null if it fails or takes too long.
  function openDb() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve) {
      var finished = false;
      function finish(db) {
        if (finished) { return; }
        finished = true;
        clearTimeout(timer);
        resolve(db);
      }
      var timer = setTimeout(function () { finish(null); }, DB_OPEN_TIMEOUT_MS);
      try {
        var request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function () {
          try {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          } catch (e) { /* the success or error event follows */ }
        };
        request.onsuccess = function () {
          var db = request.result;
          db.onversionchange = function () { db.close(); dbPromise = null; };
          finish(db);
        };
        request.onerror = function () { finish(null); };
        request.onblocked = function () { finish(null); };
      } catch (e) {
        finish(null);
      }
    });
    return dbPromise;
  }

  // Turn a stored record into a Blob. Return null if the record is not usable.
  function blobFromRecord(record) {
    if (!record || !record.data) { return null; }
    var data = record.data;
    if (data instanceof Blob) { return data.size > 0 ? data : null; }
    if (data instanceof ArrayBuffer && data.byteLength > 0) {
      return new Blob([data], { type: 'audio/mpeg' });
    }
    return null;
  }

  // Read one clip from IndexedDB. Resolve to a Blob or null.
  function dbGet(id) {
    return openDb().then(function (db) {
      if (!db) { return null; }
      return new Promise(function (resolve) {
        try {
          var request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
          request.onsuccess = function () {
            try { resolve(blobFromRecord(request.result)); } catch (e) { resolve(null); }
          };
          request.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  // Write one clip to IndexedDB. Resolve to true if the write worked.
  function dbPut(clip, blob) {
    return openDb().then(function (db) {
      if (!db) { return false; }
      return new Promise(function (resolve) {
        try {
          var record = { id: clip.id, voice: clip.voice, text: clip.text, data: blob, savedAt: new Date().toISOString() };
          var transaction = db.transaction(STORE_NAME, 'readwrite');
          transaction.objectStore(STORE_NAME).put(record);
          transaction.oncomplete = function () { resolve(true); };
          transaction.onerror = function () { resolve(false); };
          transaction.onabort = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  // ---------- Azure voice request ----------

  // Wait for some milliseconds.
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Turn the details text of an error into a code. The text is never shown.
  function classifyText(text) {
    var lower = String(text || '').toLowerCase();
    if (/\b(401|403)\b|authenticat|forbidden|unauthori|subscription key/.test(lower)) { return 'key'; }
    if (/\b429\b|too many/.test(lower)) { return 'busy'; }
    if (/connection|network|websocket|failed to fetch|timeout|timed out|offline|unable to contact/.test(lower)) { return 'network'; }
    return 'other';
  }

  // Turn a failed synthesis result into a code: 'key', 'busy', 'network', or 'other'.
  function classifyResult(result) {
    var SDK = window.SpeechSDK;
    try {
      var details = SDK.CancellationDetails.fromResult(result);
      var codes = SDK.CancellationErrorCode;
      if (details.ErrorCode === codes.AuthenticationFailure || details.ErrorCode === codes.Forbidden) { return 'key'; }
      if (details.ErrorCode === codes.TooManyRequests) { return 'busy'; }
      if (details.ErrorCode === codes.ConnectionFailure) { return 'network'; }
    } catch (e) { /* use the text below */ }
    return classifyText(result && result.errorDetails);
  }

  // Make one voice request. Resolve to {ok:true, data} or {ok:false, error}.
  function requestOnce(clip, key, region) {
    return new Promise(function (resolve) {
      var SDK = window.SpeechSDK;
      var synth = null;
      var settled = false;
      function finish(outcome) {
        if (settled) { return; }
        settled = true;
        try { if (synth) { synth.close(); } } catch (e) { /* ignore */ }
        resolve(outcome);
      }
      function fail(code) {
        if (code === 'other' && typeof navigator !== 'undefined' && navigator.onLine === false) { code = 'network'; }
        finish({ ok: false, error: code });
      }
      try {
        var config = SDK.SpeechConfig.fromSubscription(key, region);
        config.speechSynthesisVoiceName = clip.voice;
        config.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat[SP.config.clipFormat];
        synth = new SDK.SpeechSynthesizer(config, null);
        synth.speakTextAsync(
          clip.text,
          function (result) {
            var good = result && result.reason === SDK.ResultReason.SynthesizingAudioCompleted;
            if (good && result.audioData && result.audioData.byteLength > 0) {
              finish({ ok: true, data: result.audioData });
            } else if (good) {
              fail('other');
            } else {
              fail(classifyResult(result));
            }
          },
          function (err) { fail(classifyText(err)); }
        );
      } catch (e) {
        fail('other');
      }
    });
  }

  // Get one clip from Azure. On "busy", wait and try again. Resolve to a Blob or an error code.
  async function fetchClip(clip, key, region) {
    var waits = SP.config.retryWaitsMs;
    for (var attempt = 0; attempt <= waits.length; attempt++) {
      var outcome = await requestOnce(clip, key, region);
      if (outcome.ok) {
        return { ok: true, blob: new Blob([outcome.data], { type: 'audio/mpeg' }) };
      }
      if (outcome.error !== 'busy' || attempt === waits.length) {
        return { ok: false, error: outcome.error };
      }
      await sleep(waits[attempt]);
    }
    return { ok: false, error: 'busy' };
  }

  // ---------- Prepare a lesson ----------

  // Call the progress function without letting its errors stop the work.
  function report(onProgress, done, total) {
    if (typeof onProgress !== 'function') { return; }
    try { onProgress(done, total); } catch (e) { /* ignore */ }
  }

  // Free the object URLs of clips that the new lesson does not need.
  function dropUnusedUrls(keepIds) {
    Object.keys(urls).forEach(function (id) {
      if (keepIds.indexOf(id) === -1) {
        try { URL.revokeObjectURL(urls[id]); } catch (e) { /* ignore */ }
        delete urls[id];
      }
    });
  }

  // Find the Blob of one clip. Look in memory, then in IndexedDB, then ask Azure.
  // Resolve to {ok:true, blob} or {ok:false, error}.
  async function getBlob(clip) {
    if (memoryBlobs[clip.id]) { return { ok: true, blob: memoryBlobs[clip.id] }; }
    var stored = await dbGet(clip.id);
    if (stored) { return { ok: true, blob: stored }; }
    var key = SP.storage.getKey();
    var region = SP.storage.getRegion();
    if (!key || !region) { return { ok: false, error: 'key' }; }
    if (!window.SpeechSDK) { return { ok: false, error: 'other' }; }
    var fetched = await fetchClip(clip, key, region);
    if (!fetched.ok) { return fetched; }
    var saved = await dbPut(clip, fetched.blob);
    if (!saved) { memoryBlobs[clip.id] = fetched.blob; }
    return fetched;
  }

  // Load all clips of a lesson, one after another.
  // Resolve to {ok:true} or {ok:false, error:'key'|'network'|'busy'|'other'}.
  async function prepareLesson(lesson, onProgress) {
    var clips = clipsOfLesson(lesson);
    dropUnusedUrls(clips.map(function (clip) { return clip.id; }));
    var total = clips.length;
    var done = 0;
    try {
      for (var i = 0; i < clips.length; i++) {
        var clip = clips[i];
        if (!urls[clip.id]) {
          var found = await getBlob(clip);
          if (!found.ok) { return { ok: false, error: found.error }; }
          urls[clip.id] = URL.createObjectURL(found.blob);
        }
        done++;
        report(onProgress, done, total);
      }
    } catch (e) {
      return { ok: false, error: 'other' };
    }
    return { ok: true };
  }

  // ---------- Play ----------

  // Return the shared audio element. Create it at the first call.
  function getPlayer() {
    if (player) { return player; }
    player = document.createElement('audio');
    player.setAttribute('playsinline', '');
    player.setAttribute('webkit-playsinline', '');
    player.preload = 'auto';
    player.hidden = true;
    if (document.body) { document.body.appendChild(player); }
    return player;
  }

  // Start the clip of an exercise at once. Call this inside a tap handler.
  // Return a promise that resolves to true if the sound started. It never rejects.
  function play(exercise, slow) {
    var url = exercise ? urls[clipId(exercise)] : null;
    if (!url) { return Promise.resolve(false); }
    var rate = slow ? SP.config.slowRate : 1;
    var started;
    try {
      var element = getPlayer();
      element.src = url;
      element.defaultPlaybackRate = rate;
      element.playbackRate = rate;
      if ('preservesPitch' in element) { element.preservesPitch = true; }
      if ('webkitPreservesPitch' in element) { element.webkitPreservesPitch = true; }
      started = element.play();
    } catch (e) {
      return Promise.resolve(false);
    }
    if (started && typeof started.then === 'function') {
      return started.then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(true);
  }

  // Stop the sound and go back to the start of the clip.
  function stop() {
    if (!player) { return; }
    try {
      player.pause();
      player.currentTime = 0;
    } catch (e) { /* ignore */ }
  }

  // ---------- Error texts ----------

  // Return the message for an error code in a language.
  function errorText(error, lang) {
    var keys = { key: 'audioErrKey', network: 'audioErrNetwork', busy: 'audioErrBusy' };
    return SP.t(keys[error] || 'audioErrOther', lang);
  }

  SP.audio = {
    needsAudio: needsAudio,
    prepareLesson: prepareLesson,
    play: play,
    stop: stop,
    errorText: errorText
  };
}());
