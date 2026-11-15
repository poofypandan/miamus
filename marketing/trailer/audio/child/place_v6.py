"""The three voice folders for the v6 mix (audio/mix.py --voice … --girl … --mama …).

  .tools/venv-main/bin/python audio/child/place_v6.py --girl chatterbox-lively --mama aita \
      [--l10 audio/out/eleven/v6/kakak-lyly] [--mama-from audio/out/eleven/v6]

  audio/out/vo/girl-<name>/<locale>/G1 G2 G3.wav   her first call, the brighter second call, "Mama…?"
  audio/out/vo/mama-<name>/<locale>/M1 M2.wav      "In a minute, sweetie…", "I'm looking, sweetie."
  audio/out/vo/eleven-lyly-v6/<locale>/*.wav       Kakak's v5 lines, with the new L10
Every clip is trimmed and brought to the same level as Kakak's (jobs.tidy48).
"""
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "eleven"))
import jobs  # noqa: E402

VO = os.path.join(ROOT, "audio", "out", "vo")


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def first(d, stem):
    return os.path.join(d, next(f for f in sorted(os.listdir(d)) if f.split(".")[0] == stem))


def put(src, dst):
    jobs.to_wav48(src, dst)
    return round(jobs.tidy48(dst), 2)


def main():
    girl, mama = opt("--girl"), opt("--mama")
    l10 = opt("--l10", os.path.join(ROOT, "audio", "out", "eleven", "v6", "kakak-lyly"))
    mama_from = opt("--mama-from", os.path.join(ROOT, "audio", "out", "eleven", "v6"))
    cand = os.path.join(ROOT, "audio", "out", "child", "candidates", girl)
    for locale in ("en", "id"):
        g = os.path.join(VO, f"girl-{girl}", locale)
        print(locale, "girl", put(os.path.join(cand, f"{locale}-look1.wav"), os.path.join(g, "G1.wav")),
              put(os.path.join(cand, f"{locale}-look2.wav"), os.path.join(g, "G2.wav")),
              put(os.path.join(cand, "unanswered.wav"), os.path.join(g, "G3.wav")))
        m_src = os.path.join(mama_from, f"mama-{mama}", locale)
        m = os.path.join(VO, f"mama-{mama}", locale)
        print(locale, "mama", put(first(m_src, "M1"), os.path.join(m, "M1.wav")), put(first(m_src, "M2"), os.path.join(m, "M2.wav")))
        k_src, k = os.path.join(VO, "eleven-lyly", locale), os.path.join(VO, "eleven-lyly-v6", locale)
        os.makedirs(k, exist_ok=True)
        for f in os.listdir(k_src):
            shutil.copy(os.path.join(k_src, f), os.path.join(k, f))
        print(locale, "kakak L10", put(first(os.path.join(l10, locale), "L10"), os.path.join(k, "L10.wav")))


if __name__ == "__main__":
    main()
