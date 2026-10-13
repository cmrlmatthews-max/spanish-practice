# Lesson test harness

This harness runs every lesson from Start to the end in headless Chromium.
It needs no microphone and no Azure account.

## What it does

- It serves the repository on `http://127.0.0.1` with a small Node server.
- It loads the page in a phone-size Chromium window (390 by 844, touch on).
- It replaces the Azure Speech SDK file with `fake-speech-sdk.js`.
  The fake gives silent voice clips and made-up speech scores.
- It puts a fake key, a fake region, and the profile in browser storage.
  It never uses a real key.
- For each lesson it does these steps:
  1. Open the lesson from the lesson list. Tap Start. Wait for the clips. Tap Begin.
  2. Use the exercise grid: jump to the last exercise, go back, jump to the first.
  3. Answer each exercise the right way:
     - Listen and choose: tap the correct picture.
     - Listen and type: type the sentence.
     - Repeat and read aloud: tap Record and wait for the score.
  4. On a score, tap a word and tap "Hear it" and "Slow".
  5. Tap Next until the end screen shows. Go back to the lesson list.
- It also checks these things:
  console errors, page errors, failed requests (for example a missing image),
  "Lesson file problems", error text in the page, the number of exercises reached,
  the verdict of each exercise, the progress saved, the clips requested (once each),
  the slow replay speed, and the rule that no sentence shows before the answer.

## Setup

You need Node 18 or newer and the `playwright` package with Chromium.
The repository has no `package.json`. Install Playwright outside the repository:

```
cd ~
npm install playwright
npx playwright install chromium
export PLAYWRIGHT_DIR=~/node_modules
```

The script looks for `playwright` in the normal places, in `PLAYWRIGHT_DIR`,
and in the global npm folder.

## Run

Run these commands from the repository root.

```
node test/harness/run-lessons.mjs                       # all lessons in lessons/index.json
node test/harness/run-lessons.mjs 1.1.1 4.1.1           # some lessons
node test/harness/run-lessons.mjs 1.1.1 --mode=mixed    # one red word and one yellow word
node test/harness/run-lessons.mjs 1.1.1 --mode=fail     # wrong picture, low score, omitted word
node test/harness/run-lessons.mjs --mode=busy           # "too many requests" error, then a retry
node test/harness/run-lessons.mjs --mode=nomatch        # "no speech" error, then a retry
node test/harness/run-lessons.mjs 1.1.1 --lang=es       # Spanish explanation language
node test/harness/run-lessons.mjs --screens=/tmp/shots  # save a screenshot of each screen
```

A lesson that has a file but is not in `lessons/index.json` still runs
if you name its id. The harness adds it to the index for that run only.
It does not change any file.

The exit code is 0 if all lessons reach the end with no error. It is 1 if not.
It is 2 if the harness itself fails.

## Files

- `fake-speech-sdk.js` is the fake SDK. `window.__fakeSdk` holds the mode and the logs
  of the voice requests (`synth`) and of the recordings (`recog`).
- `run-lessons.mjs` is the test script.

## What it does NOT test

- Safari and WebKit on iPhone. The harness uses Chromium.
  Sound rules of Safari (sound only after a tap), storage loss, and layout on a real phone are not tested.
- The real microphone and the microphone permission.
- Real Azure speech scores. The scores are made up. Pass and fail values are not checked against Azure.
- Real Azure voices. The clips are silent. Pronunciation and natural Spanish are not checked.
- A wrong key, a wrong region, a real network failure, and the limits of the free tier.
- Timing. A real score can take 6 to 18 seconds. The fake takes 0.3 seconds.
