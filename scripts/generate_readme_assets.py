"""Generate localized README SVG headers using only the Python standard library."""

from html import escape
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "readme"
COPY = {
    "en": ("STUDENT COMMERCE / OPERATIONS", "From checkout to pickup.", "Order", "Merchandise and order paperwork sketched on an engineering notebook grid."),
    "pt-BR": ("COMÉRCIO ESTUDANTIL / OPERAÇÕES", "Do checkout à retirada.", "Pedido", "Produtos e documentos de pedidos desenhados sobre o quadriculado de um caderno de engenharia."),
}
THEMES = {
    "light": {"bg": "#f7f7fc", "line": "#dcdcf0", "ink": "#242348", "muted": "#62627b", "accent": "#514aa9", "paper": "#eeedf9"},
    "dark": {"bg": "#171827", "line": "#34354c", "ink": "#eeedf8", "muted": "#b4b3cd", "accent": "#b3adf5", "paper": "#222338"},
}


def header(language: str, theme: str) -> str:
    category, tagline, order, description = map(escape, COPY[language])
    c = THEMES[theme]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200" viewBox="0 0 1000 200" role="img" aria-labelledby="title desc" xml:lang="{language}">
  <title id="title">CAEGS Shop — {tagline}</title>
  <desc id="desc">{description}</desc>
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="{c['line']}" stroke-width="0.7"/></pattern>
    <clipPath id="rounded"><rect x="1" y="1" width="998" height="198" rx="18"/></clipPath>
  </defs>
  <rect x="1" y="1" width="998" height="198" rx="18" fill="{c['bg']}" stroke="{c['line']}"/>
  <g clip-path="url(#rounded)"><rect x="665" y="1" width="335" height="198" fill="url(#grid)" opacity="0.65"/></g>
  <path d="M21 30q-3 65 0 140" fill="none" stroke="{c['accent']}" stroke-width="3" stroke-linecap="round"/>
  <g font-family="'Segoe UI', Arial, sans-serif">
    <text x="46" y="44" font-family="Consolas, monospace" font-size="12" letter-spacing="1.5" fill="{c['accent']}">{category}</text>
    <text x="44" y="104" font-size="46" font-weight="650" letter-spacing="-1.5" fill="{c['ink']}">CAEGS Shop</text>
    <text x="46" y="141" font-size="20" fill="{c['muted']}">{tagline}</text>
  </g>
  <path d="M46 163q99-4 202 0m-195 5q88-3 161 0" fill="none" stroke="{c['accent']}" stroke-linecap="round" opacity="0.35"/>
  <g stroke="{c['accent']}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(714 65) rotate(-5 43 45)">
      <path d="M8 18q35-2 70 0l5 77q-42 3-81 0Z" fill="{c['paper']}"/>
      <path d="M26 23V12q0-15 17-15t17 15v11" fill="none"/>
      <path d="m26 52 12 12 23-25" fill="none"/>
    </g>
    <path d="M805 97q20-17 38-6m-7-7 8 7-9 5" fill="none"/>
    <g transform="translate(865 44) rotate(5 38 51)">
      <path d="M0 0h75v107l-9-5-9 5-9-5-10 5-10-5-9 5-9-5-10 5Z" fill="{c['paper']}"/>
      <path d="M14 40h47M14 52h36M14 64h47M14 84h20" fill="none" opacity="0.65"/>
      <path d="m47 83 5 5 10-12" fill="none"/>
    </g>
  </g>
  <text x="903" y="72" text-anchor="middle" transform="rotate(5 903 72)" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="{c['ink']}">{order}</text>
  <path d="M702 174q107-6 239-1" fill="none" stroke="{c['accent']}" stroke-width="1.2" stroke-linecap="round" opacity="0.35"/>
</svg>
'''


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for language in COPY:
        for theme in THEMES:
            path = OUTPUT / f"header-{theme}-{language}.svg"
            path.write_text(header(language, theme), encoding="utf-8", newline="\n")
            print(path.relative_to(OUTPUT.parents[1]))


if __name__ == "__main__":
    main()
