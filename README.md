# Spanish practice

A small web tool for Spanish practice. Cade and Casey use it.
It teaches Mexican Spanish (es-MX). Speech scores come from Azure Speech.

The tool is static. It has plain HTML, CSS, JavaScript, and JSON files.
There is no framework and no build step.
GitHub Pages hosts it. The main file is `index.html`.

## Folders

- `index.html` is the main page.
- `css/` has the styles.
- `js/` has the tool code.
- `js/vendor/` has the Azure Speech SDK file. Do not edit it.
- `lessons/` has one JSON file for each lesson, and `index.json`.
- `test/` has the old test page for the microphone and the voices.

## Add a lesson

1. Write the lesson file in `lessons/`. Name it `lesson-<lessonId>.json`.
2. Add the file name to `lessons/index.json`.
3. Open the tool. The lesson list shows the lesson.
4. If the file has a problem, the lesson list shows it under "Lesson file problems".
5. `lessons/lesson.schema.json` holds the format rules. A JSON Schema tool can check a lesson file against it.

## The Azure key

The key never goes in the repository.
Each person types the key and the region in the Settings screen.
The tool keeps them in the storage of that browser only.
The progress backup file does not have the key.
