// Speech-to-text providers for the Kakak voice comparison (run-voice.ts).
// Each sends one local clip and returns the text. A provider is skipped when
// its key isn't set, so nothing is uploaded by accident. Hosts are fixed to
// the official APIs; no base-URL override from the environment.
//
// Every endpoint, header and field below was checked against the official
// docs on 2026-11-08 (URLs above each function).

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export type ProviderId = "scribe" | "soniox" | "deepgram";

export interface TranscribeOptions {
  /** Household names (staff, pets) to bias recognition toward. */
  keyterms: string[];
}

export interface TranscribeResult {
  text: string;
  /** Wall time from upload start to text, in milliseconds. */
  ms: number;
}

export interface Provider {
  id: ProviderId;
  label: string;
  envKey: string;
  /** US dollars per minute of audio, list price (see comments). */
  usdPerMinute: number;
  transcribe(file: string, options: TranscribeOptions): Promise<TranscribeResult>;
}

const MIME_BY_EXT: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export function mimeFor(file: string): string {
  const mime = MIME_BY_EXT[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported audio type: ${file}`);
  return mime;
}

function requireKey(envKey: string): string {
  const key = process.env[envKey];
  if (!key) throw new Error(`${envKey} is not set`);
  return key;
}

async function fail(response: Response, what: string): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new Error(`${what} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
}

// ElevenLabs Scribe v2, batch.
// API reference: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
//   POST https://api.elevenlabs.io/v1/speech-to-text, header xi-api-key,
//   multipart/form-data: model_id ("scribe_v2"), file, optional language_code,
//   keyterms (list of strings, max 50 characters / 5 words each; a 20%
//   surcharge). Response JSON has `text`.
// Keyterms are sent as one repeated form field per term, as the official SDK
// does (github.com/elevenlabs/elevenlabs-js, speechToText Client.ts:
// `_body.append("keyterms", _item)` in a loop).
// language_code is left out so Scribe detects the language itself, which suits
// Indonesian/English mixing (Indonesian is "ind", Excellent tier:
// https://elevenlabs.io/docs/capabilities/speech-to-text).
// Price: $0.22 per hour for Scribe v2 batch (https://elevenlabs.io/pricing/api,
// 2026-11-08); keyterms add 20%, included below.
const scribe: Provider = {
  id: "scribe",
  label: "ElevenLabs Scribe v2",
  envKey: "ELEVENLABS_API_KEY",
  usdPerMinute: (0.22 * 1.2) / 60,
  async transcribe(file, { keyterms }) {
    const key = requireKey(this.envKey);
    const bytes = await readFile(file);
    const form = new FormData();
    form.append("model_id", "scribe_v2");
    form.append("file", new Blob([bytes], { type: mimeFor(file) }), basename(file));
    for (const term of keyterms) form.append("keyterms", term);
    const started = Date.now();
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!response.ok) await fail(response, "ElevenLabs speech-to-text");
    const json = (await response.json()) as { text?: unknown };
    if (typeof json.text !== "string") throw new Error("ElevenLabs: response has no text");
    return { text: json.text, ms: Date.now() - started };
  },
};

// Soniox async file transcription.
// Docs: https://docs.soniox.com/stt/async/async-transcription (flow, model
//   "stt-async-v6"), and the REST reference:
//   upload  POST   https://api.soniox.com/v1/files (multipart field `file`) → { id }
//           https://docs.soniox.com/stt/api-reference/files/upload_file
//   create  POST   https://api.soniox.com/v1/transcriptions (JSON: model, file_id,
//           language_hints, context) → { id, status }
//           https://docs.soniox.com/stt/api-reference/transcriptions/create_transcription
//   poll    GET    https://api.soniox.com/v1/transcriptions/{id} → status
//           queued | processing | completed | error, error_message
//           https://docs.soniox.com/stt/api-reference/transcriptions/get_transcription
//   text    GET    https://api.soniox.com/v1/transcriptions/{id}/transcript → { text }
//           https://docs.soniox.com/stt/api-reference/transcriptions/get_transcription_transcript
//   delete  DELETE https://api.soniox.com/v1/transcriptions/{id} and /v1/files/{id} (204)
//           https://docs.soniox.com/stt/api-reference/transcriptions/delete_transcription
//           https://docs.soniox.com/stt/api-reference/files/delete_file
//   Auth: Authorization: Bearer <key>.
//   context.terms: array of strings for names (https://docs.soniox.com/stt/concepts/context).
// The model can be changed with SONIOX_MODEL if Soniox renames it.
// Price: about $0.10 per hour async (https://soniox.com/pricing, 2026-11-08).
// The clip and its transcript are deleted from Soniox after each run.
const SONIOX_API = "https://api.soniox.com/v1";

/** Deletes the transcription and the uploaded clip; returns what is left behind. */
export async function sonioxCleanup(
  auth: Record<string, string>,
  transcriptionId: string | null,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const targets = [
    ...(transcriptionId ? [{ what: `transcription ${transcriptionId}`, url: `${SONIOX_API}/transcriptions/${transcriptionId}` }] : []),
    { what: `file ${fileId}`, url: `${SONIOX_API}/files/${fileId}` },
  ];
  const leftovers: string[] = [];
  for (const target of targets) {
    try {
      const response = await fetchImpl(target.url, { method: "DELETE", headers: auth });
      // 404: already gone, which is what we want.
      if (!response.ok && response.status !== 404) leftovers.push(`${target.what} (HTTP ${response.status})`);
    } catch (error) {
      leftovers.push(`${target.what} (${error instanceof Error ? error.message : "network error"})`);
    }
  }
  return leftovers;
}

const soniox: Provider = {
  id: "soniox",
  label: "Soniox async",
  envKey: "SONIOX_API_KEY",
  usdPerMinute: 0.1 / 60,
  async transcribe(file, { keyterms }) {
    const key = requireKey(this.envKey);
    const auth = { Authorization: `Bearer ${key}` };
    const bytes = await readFile(file);
    const started = Date.now();

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeFor(file) }), basename(file));
    const upload = await fetch(`${SONIOX_API}/files`, { method: "POST", headers: auth, body: form });
    if (!upload.ok) await fail(upload, "Soniox upload");
    const fileId = ((await upload.json()) as { id: string }).id;

    let transcriptionId: string | null = null;
    try {
      const create = await fetch(`${SONIOX_API}/transcriptions`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.SONIOX_MODEL ?? "stt-async-v6",
          file_id: fileId,
          language_hints: ["id", "en"],
          ...(keyterms.length ? { context: { terms: keyterms } } : {}),
        }),
      });
      if (!create.ok) await fail(create, "Soniox create transcription");
      transcriptionId = ((await create.json()) as { id: string }).id;

      const deadline = Date.now() + 5 * 60_000;
      for (;;) {
        const poll = await fetch(`${SONIOX_API}/transcriptions/${transcriptionId}`, { headers: auth });
        if (!poll.ok) await fail(poll, "Soniox get transcription");
        const status = (await poll.json()) as { status: string; error_message?: string | null };
        if (status.status === "completed") break;
        if (status.status === "error") throw new Error(`Soniox: ${status.error_message ?? "error"}`);
        if (Date.now() > deadline) throw new Error("Soniox: timed out after 5 minutes");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const transcript = await fetch(`${SONIOX_API}/transcriptions/${transcriptionId}/transcript`, {
        headers: auth,
      });
      if (!transcript.ok) await fail(transcript, "Soniox get transcript");
      const json = (await transcript.json()) as { text?: unknown };
      if (typeof json.text !== "string") throw new Error("Soniox: transcript has no text");
      return { text: json.text, ms: Date.now() - started };
    } finally {
      // Don't leave household voices on Soniox's servers. Both deletions are
      // always tried; if either fails, the clip's result becomes an error
      // naming what to delete by hand, so it can't pass unnoticed.
      const leftovers = await sonioxCleanup(auth, transcriptionId, fileId);
      if (leftovers.length) {
        throw new Error(
          `Soniox: could not delete ${leftovers.join(" and ")}. Delete by hand (DELETE ${SONIOX_API}/transcriptions/<id> and /files/<id>) or in the Soniox console.`,
        );
      }
    }
  },
};

// Deepgram Nova-3, pre-recorded.
// API reference: https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
//   POST https://api.deepgram.com/v1/listen, Authorization: Token <key>;
//   query model=nova-3, language, smart_format, keyterm (repeatable, Nova-3 only).
//   Transcript at results.channels[0].alternatives[0].transcript.
// Local file as raw bytes with the audio Content-Type:
//   https://developers.deepgram.com/docs/pre-recorded-audio
// Language: Nova-3 lists Indonesian as monolingual `id`; its multilingual
//   `multi` mode does not include Indonesian
//   (https://developers.deepgram.com/docs/models-languages-overview), so this
//   uses language=id. English words in a mixed sentence may suffer; that is
//   part of what the comparison measures.
// Keyterms: up to 500 tokens per request (https://developers.deepgram.com/docs/keyterm).
// Price: $0.0052/min, Nova-3 multilingual pre-recorded, pay-as-you-go
//   (https://deepgram.com/pricing, 2026-11-08). Monolingual is $0.0043; the
//   higher figure is used to stay on the safe side.
const deepgram: Provider = {
  id: "deepgram",
  label: "Deepgram Nova-3 (id)",
  envKey: "DEEPGRAM_API_KEY",
  usdPerMinute: 0.0052,
  async transcribe(file, { keyterms }) {
    const key = requireKey(this.envKey);
    const bytes = await readFile(file);
    // mip_opt_out keeps household voices out of Deepgram's Model Improvement
    // Program (https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program).
    const params = new URLSearchParams({ model: "nova-3", language: "id", smart_format: "true", mip_opt_out: "true" });
    for (const term of keyterms) params.append("keyterm", term);
    const started = Date.now();
    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": mimeFor(file) },
      body: bytes,
    });
    if (!response.ok) await fail(response, "Deepgram listen");
    const json = (await response.json()) as {
      results?: { channels?: { alternatives?: { transcript?: unknown }[] }[] };
    };
    const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof text !== "string") throw new Error("Deepgram: response has no transcript");
    return { text, ms: Date.now() - started };
  },
};

export const PROVIDERS: Record<ProviderId, Provider> = { scribe, soniox, deepgram };
