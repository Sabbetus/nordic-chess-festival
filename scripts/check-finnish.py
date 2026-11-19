#!/usr/bin/env python3
"""Spell-checks the Finnish texts of the site with Voikko (the engine behind LibreOffice's Finnish spell checker).

    python3 scripts/check-finnish.py            check every Finnish text on the site
    python3 scripts/check-finnish.py --text "Pelasi Englannin ykkösluutua."   check one piece of text

It lists every word Voikko does not know, with where it is. Names and loanwords that are fine go into
scripts/finnish-allowed-words.txt (one per line). The competition regulations (src/content/regulations) come from the
organisers' original Finnish text and are not checked. Exit code 1 if there are unknown words.

A spell check only finds misspelled and made-up words. It cannot tell whether a real word is the right one, or whether
the grammar and the chess terms are right: that still needs a person who knows Finnish.

Setup (Debian / Ubuntu):  sudo apt install python3-libvoikko voikko-fi python3-yaml
"""
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import libvoikko
    import yaml
except ImportError:
    sys.exit('Missing packages. Install them with: sudo apt install python3-libvoikko voikko-fi python3-yaml')

ROOT = Path(__file__).resolve().parent.parent
voikko = libvoikko.Voikko('fi')
allowed = {
    line.strip().lower()
    for line in (ROOT / 'scripts/finnish-allowed-words.txt').read_text(encoding='utf-8').splitlines()
    if line.strip() and not line.startswith('#')
}


def collect():
    """(where, text) for every Finnish text on the site."""
    found = []
    dump = (
        "import fi from './src/i18n/fi.ts';"
        "const out = [];"
        "const walk = (v, p) => { if (typeof v === 'string') out.push([p, v]); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']')); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? p + '.' + k : k); };"
        "walk(fi.default ?? fi, '');"
        "console.log(JSON.stringify(out));"
    )
    raw = subprocess.run(
        ['node', '--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', dump],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    found += [(f'src/i18n/fi.ts: {path}', text) for path, text in json.loads(raw)]
    for path in sorted(glob.glob(str(ROOT / 'src/content/*/*.yaml'))):
        data = yaml.safe_load(open(path, encoding='utf-8'))
        rel = str(Path(path).relative_to(ROOT))

        def walk(v, where):
            if isinstance(v, dict):
                for k, x in v.items():
                    if k == 'fi' and isinstance(x, str):
                        found.append((f'{rel}: {where}', x))
                    else:
                        walk(x, f'{where}.{k}' if where else k)

        walk(data, '')
    for path in sorted(glob.glob(str(ROOT / 'src/content/*/fi.md')) + glob.glob(str(ROOT / 'src/content/news/fi/*.md'))):
        rel = str(Path(path).relative_to(ROOT))
        if 'regulations' in rel:
            continue  # the original Finnish text of the organisers
        found.append((rel, re.sub(r'^---.*?---', '', open(path, encoding='utf-8').read(), flags=re.S)))
    return found


def clean(text):
    text = re.sub(r'\[\[\w+:([^\]]+)\]\]', r'\1', text)  # [[key:text]]
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # [text](link)
    text = re.sub(r'https?://\S+|\S+@\S+|\{[^}]+\}|`[^`]*`', ' ', text)
    return re.sub(r'\d+:\w+', ' ', text)  # "14:ssä", "2500:n"


def unknown_words(text):
    for word in re.findall(r"[A-Za-zÀ-ÿĀ-ſ'’-]+", clean(text)):
        word = word.strip("-'’")
        if len(word) < 2 or word.lower() in allowed:
            continue
        if not voikko.spell(word) and not voikko.spell(word.lower()):
            yield word


if '--text' in sys.argv:
    words = sorted(set(unknown_words(sys.argv[sys.argv.index('--text') + 1])))
    print('unknown words:', ', '.join(words) if words else 'none')
    sys.exit(1 if words else 0)

problems = {}
for where, text in collect():
    for word in unknown_words(text):
        problems.setdefault(word, []).append(where)
for word, places in sorted(problems.items()):
    print(f'{word}  ({len(places)}x, e.g. {places[0]})')
print(f'\n{len(problems)} unknown word(s).' if problems else 'No unknown words.')
sys.exit(1 if problems else 0)
