#!/bin/zsh
# Asks for the ElevenLabs API key without showing it, then runs el.py with it.
# The key lives only in this process and the one it starts: never printed, never written to disk
# or to shell history, and unset when this ends (normally, Ctrl-C, or closing the tab).
#   ./audio/eleven/key.zsh                 wait for jobs in audio/eleven/queue/ (see el.py)
#   ./audio/eleven/key.zsh run <job.json>  one job, then exit
emulate -L zsh
setopt err_return no_unset
unsetopt xtrace verbose
cd "${0:A:h}/../.."

PY=.tools/venv-main/bin/python
[[ -x $PY ]] || PY=python3

trap 'unset ELEVENLABS_API_KEY; print "\nKey cleared."' EXIT
trap 'exit 130' INT TERM HUP

print "Miamus trailer: ElevenLabs"
print -n "Paste the API key here (nothing will show), then press Enter: "
read -rs ELEVENLABS_API_KEY
print
if [[ -z ${ELEVENLABS_API_KEY:-} ]]; then
  print "No key entered. Nothing was done."
  exit 1
fi
print "Key received (${#ELEVENLABS_API_KEY} characters)."
export ELEVENLABS_API_KEY
$PY audio/eleven/el.py "$@"
