#!/usr/bin/env python3
"""Moves in-app screens from raw Tailwind palette classes to RE by PX semantic tokens (app/globals.css).

Neutrals -> surface/foreground/muted/subtle/border; blue -> brand; red/rose -> danger; green/emerald -> success;
amber/yellow/orange -> warning; white text on a filled button -> that fill's foreground token.
Categorical colours (purple, indigo, teal, sky, cyan, pink, violet, fuchsia, lime) are left alone.
Marketing pages and the design-system primitives are excluded. Run from the repository root:
    python3 scripts/migrate-to-tokens.py [--dry-run]
"""
import re, sys, pathlib

ROOTS = ['app', 'components']
EXCLUDE = ('components/ui/', 'components/marketing/', 'components/audit/', 'app/dev/', 'app/global-error.tsx',
           'app/page.tsx', 'app/demo/', 'app/pricing/', 'app/leakage-audit/')
NEUTRAL = {'gray', 'slate', 'zinc', 'neutral', 'stone'}
STATUS = {'red': 'danger', 'rose': 'danger', 'green': 'success', 'emerald': 'success',
          'amber': 'warning', 'yellow': 'warning', 'orange': 'warning', 'blue': 'brand'}

TOKEN = re.compile(r'(?<![\w-])((?:[a-z0-9-]+:)*)(bg|text|border|divide|ring)-([a-z]+)(?:-(\d{2,3}))?(/\d{1,3})?(?![\w-])')

def neutral(prop, shade):
    s = int(shade) if shade else None
    if prop == 'bg':
        if s is None: return None
        return {50: 'surface-muted', 100: 'surface-hover', 200: 'surface-hover'}.get(s) or ('foreground' if s >= 800 else None)
    if prop == 'text':
        if s is None: return None
        if s >= 800: return 'foreground'
        if s >= 600: return 'muted'
        if s >= 300: return 'subtle'
        return None
    if prop in ('border', 'divide', 'ring'):
        if s is None: return None
        return 'default' if s <= 200 else 'strong' if s <= 400 else None
    return None

def status(prop, hue, shade):
    tok = STATUS[hue]; s = int(shade) if shade else None
    if s is None: return None
    if prop == 'bg':
        if s <= 100: return 'brand-light' if tok == 'brand' else f'{tok}-bg'
        if s <= 300: return ('brand-light' if tok == 'brand' else f'{tok}-bg')
        if s >= 800 and tok in ('brand', 'danger'): return f'{tok}-hover'
        return tok if s >= 500 else None
    if prop == 'text':
        return tok if s >= 500 else None
    if prop in ('border', 'divide', 'ring'):
        if prop == 'ring': return 'ring' if tok == 'brand' and s >= 300 else (tok if s >= 400 else None)
        return f'{tok}/30' if s <= 300 else tok
    return None

def convert(m):
    variants, prop, hue, shade, alpha = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5) or ''
    new = None
    if hue == 'white' and prop == 'bg' and not shade: new = 'surface'
    elif hue == 'black' and prop == 'bg' and alpha: return f'{variants}bg-overlay'
    elif hue in NEUTRAL: new = neutral(prop, shade)
    elif hue in STATUS: new = status(prop, hue, shade)
    if not new: return m.group(0)
    if '/' in new and alpha: new = new.split('/')[0]  # keep the author's own opacity
    return f'{variants}{prop}-{new}{alpha}'

FILLS = [('bg-brand', 'text-brand-foreground'), ('bg-danger', 'text-danger-foreground'),
         ('bg-success', 'text-success-foreground'), ('bg-warning', 'text-warning-foreground'), ('bg-foreground', 'text-inverse')]
STRING = re.compile(r"(['\"`])((?:(?!\1).)*?)\1", re.S)

def fix_white(lit):
    q, body = lit.group(1), lit.group(2)
    if 'text-white' not in body: return lit.group(0)
    for fill, fg in FILLS:
        if re.search(rf'(?<![\w:-]){re.escape(fill)}(?![\w-])', body):
            return q + re.sub(r'(?<![\w-])text-white(?![\w-])', fg, body) + q
    return lit.group(0)

def main():
    dry = '--dry-run' in sys.argv
    changed = total = 0
    for root in ROOTS:
        for f in pathlib.Path(root).rglob('*.tsx'):
            rel = f.as_posix()
            if rel.startswith(EXCLUDE): continue
            src = f.read_text(); out = TOKEN.sub(convert, src); out = STRING.sub(fix_white, out)
            if out != src:
                n = sum(1 for a, b in zip(src.split(), out.split()) if a != b)
                changed += 1; total += n
                if not dry: f.write_text(out)
    print(f'{"Would change" if dry else "Changed"} {changed} files (~{total} class tokens).')

if __name__ == '__main__':
    main()
