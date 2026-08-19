"""
Converte os relatórios exportados do Google Ads em um módulo TypeScript.

Existe porque o token de desenvolvedor da API ainda aguarda aprovação, e a
apresentação não pode esperar. O snapshot é dado REAL — exportado da própria
plataforma — apenas congelado num período fixo.

Uso: python3 scripts/importar-google-ads.py <diretório-dos-csv> > src/data/google-ads-snapshot.ts
"""

import csv
import glob
import json
import os
import sys


def numero(valor: str) -> float:
    """Converte número no formato pt-BR ('1.234,56', '3,93%', ' --') em float."""
    if valor is None:
        return 0.0
    v = valor.strip().replace("%", "").replace("\xa0", " ").strip()
    if v in {"", "--", "-", "0"}:
        return 0.0
    v = v.replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return 0.0


def percentual(valor: str) -> float:
    """'3,93%' -> 0.0393. O painel trabalha percentual na escala 0-1."""
    return numero(valor) / 100.0


def ler(caminho: str):
    """Lê o CSV do Google Ads: linha 1 é o título, linha 2 o período, linha 3 o cabeçalho."""
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        linhas = list(csv.reader(f))
    titulo = linhas[0][0]
    periodo = linhas[1][0]
    cabecalho = linhas[2]
    dados = [
        dict(zip(cabecalho, linha))
        for linha in linhas[3:]
        if linha and linha[0] and not linha[0].startswith("Total:")
        # As linhas "Total:" aparecem em colunas diferentes conforme o relatório.
        and not any(c.startswith("Total:") for c in linha if c)
    ]
    return titulo, periodo, dados


def achar(diretorio: str, fragmento: str) -> str:
    encontrados = [p for p in glob.glob(os.path.join(diretorio, "*.csv")) if fragmento in os.path.basename(p)]
    if not encontrados:
        raise SystemExit(f"CSV não encontrado para: {fragmento}")
    return encontrados[0]


def main() -> None:
    d = sys.argv[1]

    _, periodo, campanhas = ler(achar(d, "campanha"))
    _, _, grupos = ler(achar(d, "grupo_de_anu"))
    _, _, dispositivos = ler(achar(d, "dispositivos"))
    _, _, locais = ler(achar(d, "locais"))
    _, _, horarios = ler(achar(d, "programac"))
    _, _, termos = ler(achar(d, "termos_de_pesquisa"))
    _, _, palavras = ler(achar(d, "palavraschave"))

    # ---- Totais: somados das campanhas, não copiados da linha "Total" ----
    total_cliques = sum(int(numero(c["Cliques"])) for c in campanhas)
    total_impressoes = sum(int(numero(c["Impr."])) for c in campanhas)
    total_custo = sum(numero(c["Custo"]) for c in campanhas)
    total_conversoes = sum(numero(c["Conversões"]) for c in campanhas)

    # ---- Série por hora do dia ----
    # O export traz dia-da-semana × hora, não datas. No período de 14 dias cada
    # dia da semana ocorre duas vezes, e não há como saber a divisão entre as
    # duas ocorrências — então uma série diária seria invenção. A série por hora
    # é o recorte que o dado realmente sustenta.
    por_hora = {}
    for linha in horarios:
        hora = int(numero(linha["Hora do dia"]))
        acc = por_hora.setdefault(hora, {"cliques": 0, "impressoes": 0, "custo": 0.0, "conversoes": 0.0})
        acc["cliques"] += int(numero(linha["Cliques"]))
        acc["impressoes"] += int(numero(linha["Impr."]))
        acc["custo"] += numero(linha["Custo"])
        acc["conversoes"] += numero(linha["Conversões"])

    serie_hora = [
        {
            "hora": h,
            "custo": round(por_hora.get(h, {}).get("custo", 0.0), 2),
            "cliques": por_hora.get(h, {}).get("cliques", 0),
            "impressoes": por_hora.get(h, {}).get("impressoes", 0),
            "conversoes": por_hora.get(h, {}).get("conversoes", 0.0),
        }
        for h in range(24)
    ]

    # ---- Dia da semana ----
    ordem_dias = [
        "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
        "Quinta-feira", "Sexta-feira", "Sábado",
    ]
    por_dia = {}
    for linha in horarios:
        dia = linha["Dia da semana"].strip()
        acc = por_dia.setdefault(dia, {"cliques": 0, "impressoes": 0, "custo": 0.0, "conversoes": 0.0})
        acc["cliques"] += int(numero(linha["Cliques"]))
        acc["impressoes"] += int(numero(linha["Impr."]))
        acc["custo"] += numero(linha["Custo"])
        acc["conversoes"] += numero(linha["Conversões"])

    serie_dia = [
        {
            "dia": dia,
            "custo": round(por_dia[dia]["custo"], 2),
            "cliques": por_dia[dia]["cliques"],
            "impressoes": por_dia[dia]["impressoes"],
            "conversoes": por_dia[dia]["conversoes"],
            "ctr": round(por_dia[dia]["cliques"] / por_dia[dia]["impressoes"], 6) if por_dia[dia]["impressoes"] else 0,
        }
        for dia in ordem_dias
        if dia in por_dia
    ]

    def taxa(cliques, impressoes):
        return round(cliques / impressoes, 6) if impressoes else 0

    def cpc(custo, cliques):
        return round(custo / cliques, 2) if cliques else 0

    # ---- Campanhas ----
    linhas_campanhas = [
        {
            "campanha": c["Campanha"],
            "orcamentoDiario": numero(c["Orçamento"]),
            "status": c["Status"],
            "impressoes": int(numero(c["Impr."])),
            "cliques": int(numero(c["Cliques"])),
            "ctr": taxa(int(numero(c["Cliques"])), int(numero(c["Impr."]))),
            "custo": numero(c["Custo"]),
            "cpc": cpc(numero(c["Custo"]), int(numero(c["Cliques"]))),
            "conversoes": numero(c["Conversões"]),
            "custoPorConversao": numero(c["Custo / conv."]),
        }
        for c in campanhas
    ]

    # ---- Grupos de anúncios ----
    linhas_grupos = [
        {
            "grupo": g["Grupo de anúncios"],
            "campanha": g["Campanha"],
            "impressoes": int(numero(g["Impr."])),
            "cliques": int(numero(g["Cliques"])),
            "ctr": taxa(int(numero(g["Cliques"])), int(numero(g["Impr."]))),
            "custo": numero(g["Custo"]),
            "cpc": cpc(numero(g["Custo"]), int(numero(g["Cliques"]))),
            "conversoes": numero(g["Conversões"]),
        }
        for g in grupos
    ]
    linhas_grupos.sort(key=lambda x: -x["custo"])

    # ---- Dispositivos: agrega as campanhas ----
    por_dispositivo = {}
    for linha in dispositivos:
        nome = linha["Dispositivo"].strip()
        acc = por_dispositivo.setdefault(nome, {"cliques": 0, "impressoes": 0, "custo": 0.0, "conversoes": 0.0})
        acc["cliques"] += int(numero(linha["Cliques"]))
        acc["impressoes"] += int(numero(linha["Impr."]))
        acc["custo"] += numero(linha["Custo"])
        acc["conversoes"] += numero(linha["Conversões"])

    linhas_dispositivos = [
        {
            "dispositivo": nome,
            "impressoes": v["impressoes"],
            "cliques": v["cliques"],
            "ctr": taxa(v["cliques"], v["impressoes"]),
            "custo": round(v["custo"], 2),
            "cpc": cpc(v["custo"], v["cliques"]),
            "participacaoDoCusto": round(v["custo"] / total_custo, 6) if total_custo else 0,
        }
        for nome, v in sorted(por_dispositivo.items(), key=lambda kv: -kv[1]["custo"])
    ]

    # ---- Locais: o export repete a mesma cidade em segmentações diferentes ----
    por_local = {}
    for linha in locais:
        nome = linha["Local correspondente"].strip()
        acc = por_local.setdefault(nome, {"cliques": 0, "impressoes": 0, "custo": 0.0, "conversoes": 0.0})
        acc["cliques"] += int(numero(linha["Cliques"]))
        acc["impressoes"] += int(numero(linha["Impr."]))
        acc["custo"] += numero(linha["Custo"])
        acc["conversoes"] += numero(linha["Conversões"])

    locais_ordenados = sorted(por_local.items(), key=lambda kv: (-kv[1]["custo"], -kv[1]["impressoes"]))
    linhas_locais = [
        {
            "local": nome.replace(", Brasil", ""),
            "impressoes": v["impressoes"],
            "cliques": v["cliques"],
            "ctr": taxa(v["cliques"], v["impressoes"]),
            "custo": round(v["custo"], 2),
            "conversoes": v["conversoes"],
        }
        for nome, v in locais_ordenados[:25]
    ]
    locais_restantes = len(locais_ordenados) - len(linhas_locais)

    # ---- Termos de pesquisa ----
    por_termo = {}
    for linha in termos:
        nome = linha["Termo de pesquisa"].strip()
        acc = por_termo.setdefault(nome, {"cliques": 0, "impressoes": 0, "custo": 0.0, "conversoes": 0.0, "grupo": linha.get("Grupo de anúncios", "")})
        acc["cliques"] += int(numero(linha["Cliques"]))
        acc["impressoes"] += int(numero(linha["Impr."]))
        acc["custo"] += numero(linha["Custo"])
        acc["conversoes"] += numero(linha["Conversões"])

    termos_ordenados = sorted(por_termo.items(), key=lambda kv: (-kv[1]["cliques"], -kv[1]["impressoes"]))
    linhas_termos = [
        {
            "termo": nome,
            "grupo": v["grupo"],
            "impressoes": v["impressoes"],
            "cliques": v["cliques"],
            "ctr": taxa(v["cliques"], v["impressoes"]),
            "custo": round(v["custo"], 2),
            "conversoes": v["conversoes"],
        }
        for nome, v in termos_ordenados[:30]
    ]
    termos_restantes = len(termos_ordenados) - len(linhas_termos)

    # ---- Palavras-chave ----
    linhas_palavras = []
    for p in palavras:
        cliques = int(numero(p["Cliques"]))
        impressoes = int(numero(p["Impr."]))
        linhas_palavras.append({
            "palavra": p["Palavra-chave"],
            "correspondencia": p["Tipo de corresp."],
            "grupo": p["Grupo de anúncios"],
            "impressoes": impressoes,
            "cliques": cliques,
            "ctr": taxa(cliques, impressoes),
            "custo": numero(p["Custo"]),
            "cpc": cpc(numero(p["Custo"]), cliques),
            "conversoes": numero(p["Conversões"]),
        })
    linhas_palavras.sort(key=lambda x: -x["custo"])

    saida = {
        "periodoRotulo": periodo,
        "totais": {
            "custo": round(total_custo, 2),
            "cliques": total_cliques,
            "impressoes": total_impressoes,
            "conversoes": total_conversoes,
            "ctr": taxa(total_cliques, total_impressoes),
            "cpc": cpc(total_custo, total_cliques),
            "custoPorConversao": round(total_custo / total_conversoes, 2) if total_conversoes else 0,
        },
        "porHora": serie_hora,
        "porDiaDaSemana": serie_dia,
        "campanhas": linhas_campanhas,
        "grupos": linhas_grupos,
        "dispositivos": linhas_dispositivos,
        "locais": linhas_locais,
        "locaisRestantes": locais_restantes,
        "termos": linhas_termos,
        "termosRestantes": termos_restantes,
        "palavras": linhas_palavras,
    }

    print("// GERADO POR scripts/importar-google-ads.py — não editar à mão.")
    print("//")
    print("// Snapshot dos relatórios exportados do Google Ads. É dado REAL da conta,")
    print("// congelado num período fixo, publicado enquanto o token de desenvolvedor da")
    print("// API aguarda aprovação de acesso básico. Quando a API responder, o conector")
    print("// volta a ler ao vivo e este arquivo sai de cena.")
    print()
    print("export const GOOGLE_ADS_SNAPSHOT = ", end="")
    print(json.dumps(saida, ensure_ascii=False, indent=2), end="")
    print(" as const;")


if __name__ == "__main__":
    main()
