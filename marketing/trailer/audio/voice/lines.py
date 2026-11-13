"""Kakak's lines: the English as text, the Indonesian as hand-written phonemes.

Kokoro has no Indonesian reader, so each Indonesian line is spelled out in
its phoneme alphabet by hand. That is also what makes it sound right: é and
the soft e are told apart ("teras" / "sekali"), a final k is a glottal stop
("banyak", "untuk"), stress falls where an Indonesian speaker puts it. Her
own name is written with a plain final k and a light first stress: tested
against Whisper, that is the spelling heard as "Kakak" in every position.

Names: "Kakak" is said the Indonesian way in both languages; "Miamus" as
mee-AH-moos. Change them here and every cut follows.
"""

KAKAK_EN = "[Kakak](/kˈɑkɑk/)"
MIAMUS_EN = "[Miamus](/miˈɑmʊs/)"

EN = {
    "L1": "Running a home takes a lot of asking.",
    "L2": "What if you only had to say it once?",
    "L3": f"Hi. I'm {KAKAK_EN}, the A.I. helper inside {MIAMUS_EN}.",
    "L4": "Tell me once.",
    "L4b": "I'll take it from there.",
    "L5": "And everyone at home knows what to do.",
    "L6": "In their own language. On their own phone.",
    "L7a": "They run the home.",
    "L7b": "I just keep track.",
    "L8": "And you? You'll only hear from me,",
    "L9": "when something isn't done.",
    "L10": "That one's yours.",
    "L11": f"{MIAMUS_EN}. More time for your family.",
    "S1": f"I'm {KAKAK_EN}, {MIAMUS_EN}'s A.I. helper. Tell me once,",
    "S2": "and everyone at home knows what to do.",
    "S3": f"{MIAMUS_EN}. More time for your family.",
}

# What each Indonesian line says (for the captions and the check), and how it is spoken.
ID_TEXT = {
    "L1": "Mengurus rumah itu banyak bertanya.",
    "L2": "Bagaimana kalau cukup bilang sekali?",
    "L3": "Halo. Ini Kakak, asisten AI di Miamus.",
    "L4": "Bilang sekali ke Kakak.",
    "L4b": "Sisanya, Kakak yang atur.",
    "L5": "Dan semua orang di rumah tahu harus apa.",
    "L6": "Dalam bahasa mereka. Di HP masing-masing.",
    "L7a": "Merekalah yang mengurus rumah.",
    "L7b": "Kakak hanya membantu mencatat.",
    "L8": "Dan Anda? Anda hanya dikabari,",
    "L9": "kalau ada yang belum dikerjakan.",
    "L10": "Yang ini bagian Anda.",
    "L11": "Miamus. Lebih banyak waktu untuk keluarga.",
    "S1": "Ini Kakak, asisten AI di Miamus. Bilang sekali,",
    "S2": "dan semua orang di rumah tahu harus apa.",
    "S3": "Miamus. Lebih banyak waktu untuk keluarga.",
}

ID = {
    "L1": "məŋˈurus rˈumah ˈitu bˈaɲaʔ bərtˈaɲa.",
    "L2": "baɡaɪmˈana kˈalaʊ ʧˈukup bˈilaŋ səkˈali?",
    "L3": "hˈalo. ˈini kˌakak, asˈistən ˈeɪ ˈaɪ di miˈamus.",
    "L4": "bˈilaŋ səkˈali kə kˌakak.",
    "L4b": "sisˈaɲa, kˌakak jaŋ ˈatur.",
    "L5": "dan səmˈua ˈoraŋ di rˈumah tˈaʊ hˈarus ˈapa.",
    "L6": "dˈalam bahˈasa mərˈeka. di hapˈe mˈasiŋ mˈasiŋ.",
    "L7a": "mərˈekalah jaŋ məŋˈurus rˈumah.",
    "L7b": "kˌakak hˈaɲa məmbˈantu mənʧˈatat.",
    "L8": "dan ˈanda? ˈanda hˈaɲa dikabˈari,",
    "L9": "kˈalaʊ ˈada jaŋ bəlˈum dikərʤˈakan.",
    "L10": "jaŋ ˈini baɡˈian ˈanda.",
    "L11": "miˈamus. ləbˈih bˈaɲaʔ wˈaktu ˈuntuʔ kəluˈarɡa.",
    "S1": "ˈini kˌakak, asˈistən ˈeɪ ˈaɪ di miˈamus. bˈilaŋ səkˈali,",
    "S2": "dan səmˈua ˈoraŋ di rˈumah tˈaʊ hˈarus ˈapa.",
    "S3": "miˈamus. ləbˈih bˈaɲaʔ wˈaktu ˈuntuʔ kəluˈarɡa.",
}

# The owner's ElevenLabs audition lines (docs/private/marketing/elevenlabs-guide.md), with the demo
# household's names: the same three lines in each language, for the listening page.
AUDITION_EN = [
    "Of course. I'll have Sari turn the lights off for Coco and Bruno every night at nine thirty, with a photo.",
    "Done. Sari gets a reminder at nine thirty; you'll only hear from me if it isn't done.",
    "Aunt Rina brought [opor](/ˈOpɔɹ/)? It's best finished by Wednesday.",
]
AUDITION_ID_TEXT = [
    "Baik. Kakak siapkan: Sari mematikan lampu untuk Coco dan Bruno setiap malam jam setengah sepuluh, dengan foto.",
    "Beres. Sari diingatkan jam setengah sepuluh malam; Kakak hanya mengabari Anda kalau belum dikerjakan.",
    "Tante Rina bawa opor? Enaknya dihabiskan sampai hari Rabu, ya.",
]
AUDITION_ID = [
    "bˈaɪʔ. kˌakak siˈapkan: sˈari məmatˈikan lˈampu ˈuntuʔ kˈoko dan brˈuno sətˈiap mˈalam ʤam sətˈəŋah səpˈuluh, dəŋan fˈoto.",
    "bərˈɛs. sˈari diiŋˈatkan ʤam sətˈəŋah səpˈuluh mˈalam; kˌakak hˈaɲa məŋabˈari ˈanda kˈalaʊ bəlˈum dikərʤˈakan.",
    "tˈantə rˈina bˈawa ˈopor? ˈenakɲa dihabˈiskan sˈampaɪ hˈari rˈabu, ja.",
]
