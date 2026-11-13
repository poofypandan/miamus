#!/bin/zsh
# The whole soundtrack, from the film's timings to the four finished mixes:
#   npm run sound                                   the film's voice and music
#   npm run sound -- --voice kakak-b --music strings
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE=kakak-a
MUSIC=felt
while [ $# -gt 0 ]; do
  case "$1" in
    --voice) VOICE="$2"; shift 2 ;;
    --music) MUSIC="$2"; shift 2 ;;
    *) shift ;;
  esac
done
PY=.tools/venv-main/bin/python
[ -x "$PY" ] || { echo "Run ./audio/setup.sh first."; exit 1; }
node audio/cues.mjs
$PY audio/sfx.py
$PY audio/music/score.py 60 "$MUSIC"
$PY audio/music/score.py 15 "$MUSIC"
$PY audio/voice/speak.py "$VOICE"
$PY audio/mix.py --voice "$VOICE" --music "$MUSIC"
