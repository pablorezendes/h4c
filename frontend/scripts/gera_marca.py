"""Gera os assets web da marca H4C a partir do manual oficial.

Fonte: Z:\\manual da marca\\LOGOS (PNG 3544x2363 com transparência)
Saída: frontend/public/marca/

    python scripts/gera_marca.py
"""
import os

from PIL import Image, ImageDraw

MANUAL = r"Z:\manual da marca\LOGOS"
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "marca")

# cores oficiais extraídas dos arquivos do manual
OLIVA = (91, 105, 29)       # #5B691D — marca sobre fundo claro
OLIVA_MEDIO = (107, 118, 70)  # #6B7646
SAGE = (212, 220, 137)      # #D4DC89 — marca sobre fundo escuro


def recorta(im: Image.Image) -> Image.Image:
    """Remove a moldura transparente, deixando o conteúdo justo."""
    bbox = im.split()[-1].getbbox()
    return im.crop(bbox) if bbox else im


def redimensiona_altura(im: Image.Image, altura: int) -> Image.Image:
    prop = altura / im.height
    return im.resize((max(1, round(im.width * prop)), altura), Image.LANCZOS)


def colunas_com_conteudo(im: Image.Image) -> list[bool]:
    alpha = im.split()[-1]
    largura, altura = im.size
    dados = alpha.load()
    return [any(dados[x, y] > 40 for y in range(altura)) for x in range(largura)]


def grupos_de_glifos(preenchidas: list[bool], vao_minimo: int) -> list[tuple[int, int]]:
    """Agrupa colunas contíguas, tolerando vãos menores que `vao_minimo`."""
    grupos, inicio, ultimo_cheio = [], None, None
    for x, cheia in enumerate(preenchidas):
        if cheia:
            if inicio is None:
                inicio = x
            ultimo_cheio = x
        elif inicio is not None and ultimo_cheio is not None and x - ultimo_cheio > vao_minimo:
            grupos.append((inicio, ultimo_cheio))
            inicio, ultimo_cheio = None, None
    if inicio is not None and ultimo_cheio is not None:
        grupos.append((inicio, ultimo_cheio))
    return grupos


def extrai_simbolo(im: Image.Image) -> Image.Image:
    """Isola o 'C' com a folha — o símbolo da marca — do lockup horizontal.

    O logo é 'H 4 C+folha   DISTRIBUIÇÃO'. Agrupando colunas com um vão
    generoso, o bloco 'H4C' fica separado da palavra; dentro dele, o último
    glifo é o C com a folha.
    """
    preenchidas = colunas_com_conteudo(im)
    blocos = grupos_de_glifos(preenchidas, vao_minimo=int(im.width * 0.03))
    if not blocos:
        return im
    h4c = blocos[0]  # primeiro bloco = monograma H4C
    letras = grupos_de_glifos(preenchidas[h4c[0]: h4c[1] + 1], vao_minimo=2)
    if len(letras) >= 2:
        ini, fim = letras[-1]
        recorte = im.crop((h4c[0] + ini, 0, h4c[0] + fim + 1, im.height))
    else:
        recorte = im.crop((h4c[0], 0, h4c[1] + 1, im.height))
    return recorta(recorte)


def em_quadrado(im: Image.Image, lado: int, margem: float = 0.16) -> Image.Image:
    """Centraliza a imagem num canvas quadrado transparente."""
    util = int(lado * (1 - 2 * margem))
    prop = min(util / im.width, util / im.height)
    redim = im.resize((max(1, round(im.width * prop)), max(1, round(im.height * prop))), Image.LANCZOS)
    canvas = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    canvas.paste(redim, ((lado - redim.width) // 2, (lado - redim.height) // 2), redim)
    return canvas


def pinta(im: Image.Image, cor: tuple[int, int, int]) -> Image.Image:
    """Recolore preservando o alfa (o traço da marca é chapado)."""
    solido = Image.new("RGBA", im.size, cor + (255,))
    solido.putalpha(im.split()[-1])
    return solido


def ladrilho_arredondado(lado: int, raio_pct: float, fundo: tuple[int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([0, 0, lado - 1, lado - 1], radius=int(lado * raio_pct), fill=fundo + (255,))
    return canvas


def main() -> None:
    os.makedirs(SAIDA, exist_ok=True)
    gerados = []

    def salva(im: Image.Image, nome: str) -> None:
        caminho = os.path.join(SAIDA, nome)
        im.save(caminho, "PNG", optimize=True)
        gerados.append((nome, im.size, os.path.getsize(caminho)))

    # ---------- lockups horizontais ----------
    # As variantes de cor saem de RECOLORIR o mesmo arquivo, não de arquivos
    # diferentes do manual: garante geometria idêntica entre elas (os arquivos
    # claros do manual têm composições distintas e desalinhariam o lockup).
    oliva = recorta(Image.open(os.path.join(MANUAL, "LOGO HORIZONTAL-02.png")).convert("RGBA"))
    lockup = redimensiona_altura(oliva, 96)                 # @2x de 48px de altura
    salva(lockup, "logo-h4c.png")                            # fundo claro
    salva(pinta(lockup, (255, 255, 255)), "logo-h4c-branco.png")  # fundo oliva/escuro
    salva(pinta(lockup, SAGE), "logo-h4c-sage.png")               # fundo escuro suave

    # ---------- símbolo (C + folha) ----------
    simbolo = extrai_simbolo(oliva)
    salva(em_quadrado(simbolo, 512, margem=0.10), "simbolo-h4c.png")
    salva(pinta(em_quadrado(simbolo, 512, margem=0.10), SAGE), "simbolo-h4c-sage.png")

    # ---------- favicon: símbolo branco sobre ladrilho oliva ----------
    for lado in (512, 180, 64, 32):
        base = ladrilho_arredondado(lado, 0.22, OLIVA)
        marca = pinta(em_quadrado(simbolo, lado, margem=0.20), (255, 255, 255))
        base.alpha_composite(marca)
        salva(base, f"favicon-{lado}.png" if lado != 180 else "apple-touch-icon.png")

    print(f"{'arquivo':26s} {'dimensao':>12s} {'peso':>9s}")
    for nome, (w, h), peso in gerados:
        print(f"{nome:26s} {w:>5d}x{h:<6d} {peso/1024:>7.1f} KB")
    print(f"\n{len(gerados)} arquivos em {os.path.normpath(SAIDA)}")


if __name__ == "__main__":
    main()
