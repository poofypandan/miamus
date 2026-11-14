"""ElevenLabs for Kakak's voice: searches the Voice Library and speaks lines, from jobs in a queue.

The API key comes only from the environment (ELEVENLABS_API_KEY), set by key.zsh from a hidden
prompt. It is never printed, logged or written anywhere. Only api.elevenlabs.io is called.

  key.zsh                       (runs `el.py serve`) waits for jobs in audio/eleven/queue/, runs each,
                                and stops on audio/eleven/queue/stop, after 8 idle hours, or Ctrl-C
  key.zsh run <job.json>        runs one job and exits

A job is a JSON file that only describes work; it cannot run code:
  {"kind": "search", "name": "id-female", "params": {"gender": "female", "language": "id", ...}}
      → audio/out/eleven/library/<name>.json (GET /v1/shared-voices, all pages up to "max")
  {"kind": "voices"}
      → audio/out/eleven/library/my-voices.json (GET /v2/voices: what is already in the account)
  {"kind": "tts", "items": [{"voice_id", "text", "language_code", "out", "seed", "settings",
                             "previous_text", "next_text", "model"}]}
      → each "out" (a path under audio/out/eleven/, without extension; the extension follows the
        format the plan allows: .wav when 48 kHz WAV is allowed, else .mp3)

Each job gets <job>.done.json beside it: what happened to every item, and the characters billed.
Docs used (15 Nov 2026): POST /v1/text-to-speech/{voice_id}, GET /v1/shared-voices, GET /v2/voices,
models page (eleven_v4: newest, 90+ languages including Indonesian; style and speed not supported).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.elevenlabs.io"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
QUEUE = os.path.join(ROOT, "audio", "eleven", "queue")
OUT = os.path.join(ROOT, "audio", "out", "eleven")
MODEL = "eleven_v4"
# The owner's "warm older sister" settings (docs/private/marketing/elevenlabs-guide.md). Style and speed
# are left out: eleven_v4 does not take them. Speaker boost is sent where the model accepts it.
SETTINGS = {"stability": 0.55, "similarity_boost": 0.75, "use_speaker_boost": True}
# 48 kHz WAV first (the film's rate); some plans only allow MP3, so fall back.
FORMATS = ["wav_48000", "mp3_44100_192", "mp3_44100_128"]
# A guard on top of the key's own credit limit: this process stops before going past it.
SESSION_CHAR_CAP = int(os.environ.get("EL_CHAR_CAP", "12000"))
IDLE_HOURS = 8

state = {"chars": 0, "format": None, "drop": set()}


def key():
    k = os.environ.get("ELEVENLABS_API_KEY", "")
    if not k:
        raise SystemExit("No key in the environment. Start this through audio/eleven/key.zsh.")
    return k


def call(method, path, query=None, body=None, accept="application/json"):
    url = API + path + ("?" + urllib.parse.urlencode(query, doseq=True) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("xi-api-key", key())
    req.add_header("Accept", accept)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()


def error_text(raw):
    try:
        d = json.loads(raw)
        det = d.get("detail", d)
        if isinstance(det, dict):
            return f"{det.get('status') or det.get('code') or ''}: {det.get('message') or ''}".strip(": ")
        return str(det)[:400]
    except Exception:
        return raw[:400].decode("utf-8", "replace")


def inside_out(path):
    full = os.path.abspath(os.path.join(ROOT, path))
    if not full.startswith(OUT + os.sep):
        raise ValueError(f"output must be under audio/out/eleven/: {path}")
    return full


def search(job):
    params = dict(job.get("params", {}))
    params.setdefault("page_size", 100)
    want = int(job.get("max", 300))
    voices, page = [], 0
    while len(voices) < want:
        params["page"] = page
        status, _, raw = call("GET", "/v1/shared-voices", params)
        if status != 200:
            return {"ok": False, "error": f"HTTP {status} {error_text(raw)}", "found": len(voices)}
        d = json.loads(raw)
        voices += d.get("voices", [])
        if not d.get("has_more"):
            break
        page += 1
    path = os.path.join(OUT, "library", f"{job['name']}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"params": job.get("params", {}), "voices": voices}, open(path, "w"), indent=1, ensure_ascii=False)
    return {"ok": True, "found": len(voices), "file": os.path.relpath(path, ROOT)}


def my_voices(job):
    status, _, raw = call("GET", "/v2/voices", {"page_size": 100})
    if status != 200:
        return {"ok": False, "error": f"HTTP {status} {error_text(raw)}"}
    path = os.path.join(OUT, "library", "my-voices.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(raw)
    return {"ok": True, "file": os.path.relpath(path, ROOT)}


def speak_one(item):
    out = inside_out(item["out"])
    text = item["text"]
    if state["chars"] + len(text) > SESSION_CHAR_CAP:
        return {"out": item["out"], "ok": False, "error": f"session cap of {SESSION_CHAR_CAP} characters reached"}
    body = {"text": text, "model_id": item.get("model", MODEL), "voice_settings": dict(SETTINGS, **item.get("settings", {}))}
    for k in ("language_code", "seed", "previous_text", "next_text"):
        if item.get(k) is not None:
            body[k] = item[k]
    formats = [state["format"]] if state["format"] else FORMATS
    notes = []
    for attempt in range(8):
        for k in list(state["drop"]):
            body.pop(k, None)
            body["voice_settings"].pop(k, None)
        fmt = formats[0]
        status, headers, raw = call("POST", f"/v1/text-to-speech/{item['voice_id']}", {"output_format": fmt}, body, accept="audio/*")
        if status == 200:
            state["format"] = fmt
            billed = headers.get("x-character-count") or headers.get("X-Character-Count")
            state["chars"] += int(billed) if billed and billed.isdigit() else len(text)
            ext = "wav" if fmt.startswith("wav") else "mp3"
            os.makedirs(os.path.dirname(out), exist_ok=True)
            open(f"{out}.{ext}", "wb").write(raw)
            return {"out": f"{item['out']}.{ext}", "ok": True, "format": fmt, "chars": len(text), "billed": billed,
                    "request_id": headers.get("request-id") or headers.get("Request-Id"), "notes": notes}
        msg = error_text(raw)
        low = msg.lower()
        if status == 429 or "too_many" in low or "concurrent" in low:
            time.sleep(4 + 4 * attempt)
            continue
        if ("output_format" in low or "format" in low or "tier" in low or "subscription" in low) and len(formats) > 1 and status in (400, 401, 403, 422):
            notes.append(f"{fmt} refused ({msg}); trying {formats[1]}")
            formats = formats[1:]
            continue
        dropped = False
        for k in ("previous_text", "next_text", "seed", "language_code", "use_speaker_boost", "style", "speed"):
            if k in low and k not in state["drop"]:
                state["drop"].add(k)
                notes.append(f"dropped {k} ({msg})")
                dropped = True
        if dropped:
            continue
        return {"out": item["out"], "ok": False, "error": f"HTTP {status} {msg}", "notes": notes}
    return {"out": item["out"], "ok": False, "error": "gave up after retries", "notes": notes}


def tts(job):
    results = []
    for i, item in enumerate(job["items"]):
        r = speak_one(item)
        results.append(r)
        mark = "ok " if r["ok"] else "ERR"
        print(f"  {mark} {i + 1}/{len(job['items'])} {r['out']}" + ("" if r["ok"] else f"  {r['error']}"), flush=True)
        if not r["ok"] and ("quota" in r.get("error", "").lower() or "cap" in r.get("error", "") or "401" in r.get("error", "")):
            break
    return {"ok": all(r["ok"] for r in results) and len(results) == len(job["items"]), "items": results}


def run(path):
    job = json.load(open(path))
    print(f"job {os.path.basename(path)}: {job['kind']}", flush=True)
    try:
        result = {"search": search, "voices": my_voices, "tts": tts}[job["kind"]](job)
    except Exception as e:  # report and carry on; the message never contains the key
        result = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    result["session_chars"] = state["chars"]
    json.dump(result, open(path[:-5] + ".done.json", "w"), indent=1, ensure_ascii=False)
    print(f"  done: {'ok' if result.get('ok') else 'with errors'}; characters this session: {state['chars']}", flush=True)
    return result


def serve():
    os.makedirs(QUEUE, exist_ok=True)
    stop = os.path.join(QUEUE, "stop")
    if os.path.exists(stop):
        os.remove(stop)
    print(f"Ready. Waiting for jobs in audio/eleven/queue/ (close this tab, or Ctrl-C, to end).", flush=True)
    last = time.time()
    while time.time() - last < IDLE_HOURS * 3600:
        if os.path.exists(stop):
            print("Stop requested.", flush=True)
            os.remove(stop)
            return
        jobs = sorted(f for f in os.listdir(QUEUE) if f.endswith(".json") and not f.endswith(".done.json")
                      and not os.path.exists(os.path.join(QUEUE, f[:-5] + ".done.json")))
        for f in jobs:
            run(os.path.join(QUEUE, f))
            last = time.time()
        time.sleep(2)
    print(f"No jobs for {IDLE_HOURS} hours; stopping.", flush=True)


if __name__ == "__main__":
    key()
    if len(sys.argv) > 2 and sys.argv[1] == "run":
        run(sys.argv[2])
    else:
        serve()
