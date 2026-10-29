# Coach-label regression fixtures

Everything in this folder EXCEPT `labels.json` and this README is
gitignored and must stay local only. The repo is public and the
regression clips are videos of minors. Never commit a clip, extracted
frames, pose exports, or an athlete's name.

## Layout

- `labels.json` (committed): Coach Grady's frame-by-frame labels and the
  old app's baseline readings for each clip. Frame numbers are
  `time x fps` in the label's frame rate (usually 30).
- `<clip files>` (local only): the videos themselves. Name them exactly
  as their key in `labels.json`.
- `poses/<clip file name>.json` (local only): pose streams exported from
  the app. Run the clip through the app locally (`npm run dev`), open
  the Debug Info panel on the results page, click
  "Download poses JSON", and save it here under the clip's name plus
  `.json`. Pose JSON contains landmark coordinates only, no video
  pixels, but it stays local anyway.

## Running the harness

```
npm run harness
```

Prints, per clip: metric | coach read | old app | new app | pass/fail.
Tolerances: phase frames within 2 frames, angles within 10 degrees.
Exit code 0 only when everything passes.
