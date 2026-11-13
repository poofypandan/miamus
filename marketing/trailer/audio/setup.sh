#!/bin/zsh
# Sets up the trailer's sound tools, all local and open source:
#   .tools/venv-main        numpy/scipy (music, sound effects, the mix), Kokoro (voice), Whisper (checking the words)
#   .tools/venv-chatterbox  Chatterbox Multilingual (a second voice engine)
# Models are cached under .tools/hf. Nothing here touches the app. Run from marketing/trailer.
set -euo pipefail
cd "$(dirname "$0")/.."
export HF_HOME="$PWD/.tools/hf"
command -v uv >/dev/null || brew install uv
[ -x .tools/venv-main/bin/python ] || uv venv --python 3.12 .tools/venv-main
uv pip install --python .tools/venv-main/bin/python pip numpy scipy soundfile "kokoro>=0.9.4" mlx-whisper
if [ "${1:-}" = "--chatterbox" ]; then
  [ -x .tools/venv-chatterbox/bin/python ] || uv venv --python 3.11 .tools/venv-chatterbox
  uv pip install --python .tools/venv-chatterbox/bin/python pip chatterbox-tts soundfile
fi
echo "sound tools ready"
