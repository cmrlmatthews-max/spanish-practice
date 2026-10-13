/* fake-speech-sdk.js - a fake of the Azure Speech SDK, for the test harness only.
 * It defines window.SpeechSDK with the parts that js/speech.js and js/audio.js use.
 * It needs no microphone and no network. The scores are not real.
 *
 * Control and log object: window.__fakeSdk
 *   mode      'pass' (default), 'mixed', 'fail', 'nomatch', or 'busy'
 *   delayMs   the wait before a recognition ends (default 300)
 *   scores    optional {accuracy, fluency} to replace the scores of the mode
 *   synth     log of voice requests: {voice, text, format}
 *   recog     log of recognitions: {text, mode}
 */
(function () {
  'use strict';

  // A silent MP3: 0.3 s, mono, 16 kHz. Made with ffmpeg.
  var SILENT_MP3_B64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NYwAAAAAAAAAAAAEluZm8AAAAPAAAACwAABuQALy8vLy8vLy8vQ0NDQ0NDQ0NDWFhYWFhYWFhYbW1tbW1tbW1tgoKCgoKCgoKCl5eXl5eXl5eXrKysrKysrKyswcHBwcHBwcHB1tbW1tbW1tbW6+vr6+vr6+vr////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDwAAAAAAAAAbkh1R6LwAAAAAAAAAAAAAA//NIxAAAAANIAAAAAExBTUVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NIxHwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

  var control = Object.assign({ mode: 'pass', delayMs: 300, scores: null, synth: [], recog: [] }, window.__fakeSdk || {});
  window.__fakeSdk = control;

  function silentMp3() {
    var binary = atob(SILENT_MP3_B64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
    return bytes.buffer;
  }

  // ---------- Enums ----------

  var PropertyId = {
    SpeechServiceResponse_JsonResult: 5000,
    Speech_SegmentationSilenceTimeoutMs: 5001
  };
  var ResultReason = {
    NoMatch: 0, Canceled: 1, RecognizingSpeech: 2, RecognizedSpeech: 3,
    SynthesizingAudio: 8, SynthesizingAudioCompleted: 9
  };
  var CancellationErrorCode = {
    NoError: 0, AuthenticationFailure: 1, BadRequestParameters: 2, TooManyRequests: 3,
    ConnectionFailure: 4, ServiceTimeout: 5, ServiceError: 6, ServiceUnavailable: 7,
    RuntimeError: 8, Forbidden: 9
  };
  var PronunciationAssessmentGradingSystem = { FivePoint: 1, HundredMark: 2 };
  var PronunciationAssessmentGranularity = { Phoneme: 1, Word: 2, FullText: 3 };
  var SpeechSynthesisOutputFormat = {
    Audio16Khz32KBitRateMonoMp3: 5,
    Audio16Khz64KBitRateMonoMp3: 6,
    Audio16Khz128KBitRateMonoMp3: 7,
    Audio24Khz48KBitRateMonoMp3: 21,
    Audio24Khz96KBitRateMonoMp3: 22,
    Audio24Khz160KBitRateMonoMp3: 23
  };
  var formatNames = {};
  Object.keys(SpeechSynthesisOutputFormat).forEach(function (name) {
    formatNames[SpeechSynthesisOutputFormat[name]] = name;
  });

  // ---------- Config and audio ----------

  function PropertyCollection() {
    var map = {};
    this.getProperty = function (id, fallback) {
      return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : fallback;
    };
    this.setProperty = function (id, value) { map[id] = value; };
  }

  function SpeechConfig(key, region) {
    this.subscriptionKey = key;
    this.region = region;
    this.speechRecognitionLanguage = '';
    this.speechSynthesisVoiceName = '';
    this.speechSynthesisOutputFormat = undefined;
    this.properties = new PropertyCollection();
  }
  SpeechConfig.fromSubscription = function (key, region) {
    if (!key || !region) { throw new Error('fake SDK: key and region are needed'); }
    return new SpeechConfig(key, region);
  };
  SpeechConfig.prototype.setProperty = function (id, value) { this.properties.setProperty(id, value); };

  var AudioConfig = {
    fromDefaultMicrophoneInput: function () {
      return { close: function () {} };
    }
  };

  // ---------- Pronunciation assessment ----------

  function PronunciationAssessmentConfig(referenceText, gradingSystem, granularity, enableMiscue) {
    this.referenceText = referenceText;
    this.gradingSystem = gradingSystem;
    this.granularity = granularity;
    this.enableMiscue = enableMiscue;
  }
  PronunciationAssessmentConfig.prototype.applyTo = function (recognizer) {
    recognizer.__referenceText = this.referenceText;
  };

  // Words of the reference text: split on spaces, punctuation removed.
  function referenceWords(text) {
    return String(text || '').split(/\s+/).map(function (w) {
      return w.replace(/[¿?¡!.,;:"«»()]/g, '');
    }).filter(function (w) { return w !== ''; });
  }

  // Build the Azure-shaped JSON for the current mode.
  function buildJson(text, mode) {
    var words = referenceWords(text);
    var scores = { accuracy: 92, fluency: 92, completeness: 100, pron: 92 };
    var list = words.map(function (w) {
      return { Word: w, Offset: 0, Duration: 0, PronunciationAssessment: { AccuracyScore: 90, ErrorType: 'None' } };
    });
    if (mode === 'mixed') {
      scores = { accuracy: 84, fluency: 90, completeness: 100, pron: 86 };
      if (list[0]) { list[0].PronunciationAssessment.AccuracyScore = 45; list[0].PronunciationAssessment.ErrorType = 'Mispronunciation'; }
      if (list[1]) { list[1].PronunciationAssessment.AccuracyScore = 70; list[1].PronunciationAssessment.ErrorType = 'Mispronunciation'; }
    } else if (mode === 'fail') {
      scores = { accuracy: 50, fluency: 80, completeness: 80, pron: 60 };
      var last = list[list.length - 1];
      if (last) { last.PronunciationAssessment.AccuracyScore = 0; last.PronunciationAssessment.ErrorType = 'Omission'; }
    }
    if (control.scores) {
      if (typeof control.scores.accuracy === 'number') { scores.accuracy = control.scores.accuracy; }
      if (typeof control.scores.fluency === 'number') { scores.fluency = control.scores.fluency; }
    }
    return {
      Id: 'fake', RecognitionStatus: 'Success', DisplayText: String(text || ''),
      NBest: [{
        Confidence: 0.9, Lexical: words.join(' ').toLowerCase(), Display: String(text || ''),
        PronunciationAssessment: {
          AccuracyScore: scores.accuracy, FluencyScore: scores.fluency,
          CompletenessScore: scores.completeness, PronScore: scores.pron
        },
        Words: list
      }]
    };
  }

  var PronunciationAssessmentResult = {
    // Like the real SDK: read the scores from the JSON of the result.
    fromResult: function (result) {
      var json = JSON.parse(result.properties.getProperty(PropertyId.SpeechServiceResponse_JsonResult));
      var best = json.NBest[0];
      var pa = best.PronunciationAssessment;
      return {
        accuracyScore: pa.AccuracyScore,
        fluencyScore: pa.FluencyScore,
        completenessScore: pa.CompletenessScore,
        pronunciationScore: pa.PronScore,
        detailResult: { Words: best.Words }
      };
    }
  };

  // ---------- Results ----------

  function makeResult(fields) {
    var props = new PropertyCollection();
    var result = Object.assign({ reason: ResultReason.NoMatch, text: '', errorDetails: '', properties: props }, fields);
    if (fields.json) { props.setProperty(PropertyId.SpeechServiceResponse_JsonResult, JSON.stringify(fields.json)); }
    return result;
  }

  var CancellationDetails = {
    fromResult: function (result) {
      return { reason: 0, ErrorCode: result.__errorCode || 0, errorDetails: result.errorDetails || '' };
    }
  };

  // ---------- Recognizer ----------

  function SpeechRecognizer(speechConfig, audioConfig) {
    this.speechConfig = speechConfig;
    this.audioConfig = audioConfig;
    this.speechEndDetected = null;
    this.__referenceText = '';
    this.__closed = false;
  }
  SpeechRecognizer.prototype.recognizeOnceAsync = function (onResult, onError) {
    var self = this;
    var mode = control.mode;
    var text = this.__referenceText;
    control.recog.push({ text: text, mode: mode });
    var wait = typeof control.delayMs === 'number' ? control.delayMs : 300;
    setTimeout(function () {
      if (self.__closed) { return; }
      try {
        if (typeof self.speechEndDetected === 'function') { self.speechEndDetected({}); }
        var result;
        if (mode === 'nomatch') {
          result = makeResult({ reason: ResultReason.NoMatch });
        } else if (mode === 'busy') {
          result = makeResult({
            reason: ResultReason.Canceled, __errorCode: CancellationErrorCode.TooManyRequests,
            errorDetails: 'fake: too many requests'
          });
        } else {
          result = makeResult({ reason: ResultReason.RecognizedSpeech, text: text, json: buildJson(text, mode) });
        }
        onResult(result);
      } catch (e) {
        if (onError) { onError(e); }
      }
    }, wait);
  };
  SpeechRecognizer.prototype.close = function () { this.__closed = true; };

  // ---------- Synthesizer ----------

  function SpeechSynthesizer(speechConfig, audioConfig) {
    this.speechConfig = speechConfig;
    this.audioConfig = audioConfig;
  }
  SpeechSynthesizer.prototype.speakTextAsync = function (text, onResult, onError) {
    var config = this.speechConfig;
    control.synth.push({
      voice: config.speechSynthesisVoiceName,
      text: text,
      format: formatNames[config.speechSynthesisOutputFormat] || String(config.speechSynthesisOutputFormat)
    });
    setTimeout(function () {
      try {
        onResult(makeResult({ reason: ResultReason.SynthesizingAudioCompleted, audioData: silentMp3() }));
      } catch (e) {
        if (onError) { onError(e); }
      }
    }, 20);
  };
  SpeechSynthesizer.prototype.close = function () {};

  window.SpeechSDK = {
    SpeechConfig: SpeechConfig,
    PropertyId: PropertyId,
    AudioConfig: AudioConfig,
    SpeechRecognizer: SpeechRecognizer,
    PronunciationAssessmentConfig: PronunciationAssessmentConfig,
    PronunciationAssessmentGradingSystem: PronunciationAssessmentGradingSystem,
    PronunciationAssessmentGranularity: PronunciationAssessmentGranularity,
    PronunciationAssessmentResult: PronunciationAssessmentResult,
    ResultReason: ResultReason,
    CancellationDetails: CancellationDetails,
    CancellationErrorCode: CancellationErrorCode,
    SpeechSynthesisOutputFormat: SpeechSynthesisOutputFormat,
    SpeechSynthesizer: SpeechSynthesizer
  };
}());
