from flask import Flask, request, jsonify
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os
import pdfplumber
import re

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "../banco_de_dados")
ARQ_QUESTOES = os.path.join(DB_DIR, "questoes_concurso.xlsx")
ARQ_METADADOS = os.path.join(DB_DIR, "metadados.xlsx")

# --- MAPA DE CORREÇÃO DE TÓPICOS QUEBRADOS ---
# Corrige falhas de OCR onde a primeira letra (Capitular) é separada
CORRECAO_ASSUNTOS = {
    "UBSTANTIVO": "Substantivo",
    "DJETIVO": "Adjetivo",
    "DVÉRBIO": "Advérbio",
    "RTIGO": "Artigo",
    "NTERJEIÇÃO": "Interjeição",
    "UMERAL": "Numeral",
    "RONOME": "Pronome",
    "ERBO": "Verbo",
    "ONJUNÇÃO": "Conjunção",
    "REPOSIÇÃO": "Preposição",
    "ALAVRAS SPECIAIS": "Palavras Especiais"
}


# --- FUNÇÕES UTILITÁRIAS ---
def garantir_diretorio():
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)


def limpar(texto):
    return str(texto).strip() if texto else ""


# --- LÓGICA DE EXTRAÇÃO E LIMPEZA ---

def limpar_ruido(texto):
    """
    Remove cabeçalhos, rodapés, paginação e artefatos visuais do PDF.
    """
    # Remove paginação solta (ex: "36" ou "36 de 61")
    texto = re.sub(r'\n\s*\d+(\s*de\s*\d+)?\s*\n', '\n', texto)

    # Remove o rodapé constante com CPF/Nome do aluno (Ricardo Aciole)
    texto = re.sub(r'\n\s*\d{11}\s*-\s*Ricardo Aciole.*?\n', '\n', texto, flags=re.IGNORECASE)

    # Remove cabeçalhos repetitivos do material
    padroes = [
        r"PETROBRAS \(Nível Superior\) Português",
        r"www\.estrategiaconcursos\.com\.br",
        r"Equipe Português Estratégia Concursos",
        r"Aula \d+"
    ]
    for p in padroes:
        texto = re.sub(fr'\n\s*{p}.*?\n', '\n', texto, flags=re.IGNORECASE)

    # Remove códigos de cores/artefatos (ex: ==2e5d94==)
    texto = re.sub(r'==[a-f0-9]+==', '', texto)

    return texto


def extrair_gabarito_final(texto):
    """
    Cria um mapa {numero: letra} baseado na tabela de gabaritos no final do PDF.
    """
    gabaritos = {}
    # Busca padrões como: "1. LETRA A" ou "1. GABARITO A"
    matches = re.findall(r'(?:^|\n)\s*(\d+)\.\s*(?:LETRA|Gabarito)?\s*([A-E])(?=\s|$|\n)', texto, re.IGNORECASE)
    for num, letra in matches:
        gabaritos[num] = letra.upper()
    return gabaritos


def parsear_questoes(texto_bruto):
    texto = limpar_ruido(texto_bruto)
    questoes = []

    # Gera o mapa de gabaritos da lista final para uso posterior
    gabaritos_lista = extrair_gabarito_final(texto)

    # --- 1. MAPEAMENTO DE ASSUNTOS (CONTEXTO) ---
    mapa_assuntos = []

    # Regex A: Títulos Normais (Caso o PDF venha limpo)
    regex_normal = re.compile(r'(?:QUESTÕES|LISTA DE).*?[-–—]\s*([A-ZÃÕÁÉÍÓÚÇÂÊÔÀ\s]+?)\s*[-–—]\s*CESGRANRIO',
                              re.IGNORECASE)
    for match in regex_normal.finditer(texto):
        assunto = match.group(1).strip().title()
        if len(assunto) > 3:
            mapa_assuntos.append({"inicio": match.start(), "assunto": assunto})

    # Regex B: Títulos Quebrados (Específico deste PDF com capitulares)
    regex_quebrado = re.compile(r'(?:UESTÕES\s+OMENTADAS|ISTA\s+E\s+UESTÕES)\s+([A-ZÃÕÁÉÍÓÚÇÂÊÔÀ\s]+)\s+ESGRANRIO',
                                re.IGNORECASE)
    for match in regex_quebrado.finditer(texto):
        trecho_assunto = match.group(1).strip()
        # Tenta corrigir usando o dicionário
        assunto_corrigido = CORRECAO_ASSUNTOS.get(trecho_assunto)
        if not assunto_corrigido:
            # Tenta sem espaços (ex: "S U B S T A N T I V O" -> "SUBSTANTIVO")
            assunto_corrigido = CORRECAO_ASSUNTOS.get(trecho_assunto.replace(" ", ""))

        if assunto_corrigido:
            mapa_assuntos.append({"inicio": match.start(), "assunto": assunto_corrigido})

    mapa_assuntos.sort(key=lambda x: x["inicio"])

    # --- 2. SCANNER DE QUESTÕES ---
    # Procura o padrão: Quebra de linha -> Número -> Ponto -> (Cabeçalho)
    regex_quest = re.compile(r'(?:^|\n)\s*(\d+)\.\s*\(?(.*?)\)\s*(.*?)(?=\n\s*\d+\.\s*\(|$)', re.DOTALL)

    for match in regex_quest.finditer(texto):
        pos_inicio = match.start()
        numero = match.group(1)
        cabecalho_cru = match.group(2)
        conteudo_bruto = match.group(3)

        # Filtro de Validade: Deve ser da banca CESGRANRIO ou ter estrutura de barras
        if 'CESGRANRIO' not in cabecalho_cru.upper() and '/' not in cabecalho_cru:
            continue

        # A) Define o Assunto (Baseado na posição do texto)
        assunto_atual = "Geral"
        if mapa_assuntos:
            # Pega o último assunto que apareceu antes desta questão
            anteriores = [m for m in mapa_assuntos if m["inicio"] < pos_inicio]
            if anteriores:
                assunto_atual = anteriores[-1]["assunto"]

        # B) Processa o Cabeçalho (Ano, Banca, Instituição)
        clean_header = cabecalho_cru.replace('(', '').replace(')', '')
        partes = [p.strip() for p in clean_header.split('/')]

        banca = partes[0].split('-')[0].strip() or "CESGRANRIO"
        instituicao = ""
        ano = "2025"

        for p in partes:
            if re.search(r'\b20\d{2}\b', p):  # Ano (2010-2099)
                ano = re.search(r'20\d{2}', p).group(0)
            elif p != partes[0] and not instituicao and len(p) > 2:
                instituicao = p

        # C) GABARITO (Estratégia Dupla)
        gabarito = ""

        # 1. Tenta achar no comentário (para Questões Comentadas)
        match_gab_comentado = re.search(r'Gabarito[:\.\s-]*(?:Letra)?\s*([A-E])', conteudo_bruto, re.IGNORECASE)

        if match_gab_comentado:
            gabarito = match_gab_comentado.group(1).upper()
        else:
            # 2. Busca "Look-Ahead" (Para Listas de Questões)
            # Procura nas próximas linhas (raio de 15000 chars) pelo padrão "Numero. LETRA X"
            raio_busca = texto[match.end():match.end() + 15000]
            match_gl = re.search(fr'(?:^|\s){numero}\.\s*(?:LETRA|Gabarito)?\s*([A-E])', raio_busca, re.IGNORECASE)
            if match_gl:
                gabarito = match_gl.group(1).upper()

        # D) LIMPEZA E SEPARAÇÃO DE ALTERNATIVAS

        # Corte 1: Remove a parte do comentário ou o gabarito explícito da questão comentada
        conteudo_limpo = re.split(r'(?:\n\s*Comentários:|\n\s*Gabarito)', conteudo_bruto, flags=re.IGNORECASE)[0]

        # Corte 2 (MURO DE CONTENÇÃO):
        # Se encontrar um título de seção GRANDE (ex: LISTA DE QUESTÕES) logo depois, corta ali.
        # Isso impede que o índice ou gabarito da próxima seção suje a alternativa E.
        conteudo_limpo = re.split(r'\n\s*(?:G\s*A\s*B\s*A\s*R\s*I\s*T\s*O|L\s*I\s*S\s*T\s*A\s*D\s*E)', conteudo_limpo,
                                  flags=re.IGNORECASE)[0]

        # Separação das Alternativas (Aceita formato inline "a) ... b) ...")
        partes_alt = re.split(r'(?:^|\s+)([a-eA-E])\)\s+', conteudo_limpo)

        enunciado = partes_alt[0].strip()
        alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}

        if len(partes_alt) > 1:
            for k in range(1, len(partes_alt), 2):
                letra = partes_alt[k].upper()
                if k + 1 < len(partes_alt):
                    txt = partes_alt[k + 1].strip()
                    # Remove sujeira final (pontos soltos, traços)
                    txt = re.sub(r'Gabarito.*$', '', txt, flags=re.IGNORECASE).strip().rstrip('.;-')
                    alts[letra] = txt

        # Validação Final
        if enunciado and (alts["A"] or alts["B"]):
            questoes.append({
                "temp_id": numero,
                "banca": banca,
                "instituicao": instituicao,
                "ano": ano,
                "assunto": assunto_atual,
                "enunciado": enunciado,
                "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"], "alt_e": alts["E"],
                "gabarito": gabarito,
                "dificuldade": "Médio", "tipo": "ME"
            })

    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages:
            texto += (page.extract_text() or "") + "\n"
    return texto


# --- CRUD BÁSICO DE QUESTÕES ---
def verificar_questoes():
    garantir_diretorio()
    if not os.path.exists(ARQ_QUESTOES):
        wb = Workbook()
        ws = wb.active
        ws.title = "questoes"
        ws.append([
            "id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo",
            "alt_a", "alt_b", "alt_c", "alt_d", "alt_e",
            "gabarito", "respondidas", "acertos"
        ])
        wb.save(ARQ_QUESTOES)


def carregar_questoes():
    verificar_questoes()
    wb = load_workbook(ARQ_QUESTOES)
    ws = wb.active
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        dados.append({
            "id": row[0],
            "banca": row[1] or "", "instituicao": row[2] or "", "ano": row[3] or "",
            "enunciado": row[4], "disciplina": row[5], "assunto": row[6],
            "dificuldade": row[7], "tipo": row[8],
            "alt_a": row[9], "alt_b": row[10], "alt_c": row[11], "alt_d": row[12], "alt_e": row[13],
            "gabarito": row[14], "respondidas": row[15] or 0, "acertos": row[16] or 0
        })
    return dados


def salvar_questoes(dados):
    wb = Workbook()
    ws = wb.active
    ws.append(
        ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
         "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos"])
    for item in dados:
        ws.append([
            item["id"], item.get("banca"), item.get("instituicao"), item.get("ano"),
            item["enunciado"], item["disciplina"], item["assunto"], item["dificuldade"], item["tipo"],
            item.get("alt_a"), item.get("alt_b"), item.get("alt_c"), item.get("alt_d"), item.get("alt_e"),
            item["gabarito"], item["respondidas"], item["acertos"]
        ])
    wb.save(ARQ_QUESTOES)


# --- GERENCIAMENTO DE METADADOS ---
def verificar_metadados():
    garantir_diretorio()
    if not os.path.exists(ARQ_METADADOS):
        wb = Workbook()
        ws1 = wb.active
        ws1.title = "bancas"
        ws1.append(["nome"])
        for b in ["Cesgranrio", "Cebraspe", "FGV", "Vunesp", "FCC"]: ws1.append([b])
        ws2 = wb.create_sheet("instituicoes")
        ws2.append(["nome"])
        for i in ["Petrobras", "Transpetro", "Banco do Brasil", "Caixa"]: ws2.append([i])
        ws3 = wb.create_sheet("disciplinas")
        ws3.append(["nome"])
        for d in ["Português", "Matemática", "Raciocínio Lógico", "Informática",
                  "Conhecimentos Específicos"]: ws3.append([d])
        ws4 = wb.create_sheet("assuntos")
        ws4.append(["nome", "disciplina", "ordem"])
        ws4.append(["Crase", "Português", 1])
        ws4.append(["Pontuação", "Português", 2])
        wb.save(ARQ_METADADOS)


def carregar_meta_dict():
    verificar_metadados()
    wb = load_workbook(ARQ_METADADOS)
    dados = {"bancas": [], "instituicoes": [], "disciplinas": [], "assuntos": []}
    if "bancas" in wb.sheetnames:
        for r in wb["bancas"].iter_rows(min_row=2, values_only=True):
            if r[0]: dados["bancas"].append(str(r[0]))
    if "instituicoes" in wb.sheetnames:
        for r in wb["instituicoes"].iter_rows(min_row=2, values_only=True):
            if r[0]: dados["instituicoes"].append(str(r[0]))
    if "disciplinas" in wb.sheetnames:
        for r in wb["disciplinas"].iter_rows(min_row=2, values_only=True):
            if r[0]: dados["disciplinas"].append(str(r[0]))
    if "assuntos" in wb.sheetnames:
        for r in wb["assuntos"].iter_rows(min_row=2, values_only=True):
            if r[0]: dados["assuntos"].append({
                "nome": str(r[0]),
                "disciplina": str(r[1]),
                "ordem": int(r[2]) if r[2] is not None else 999
            })
    dados["bancas"].sort()
    dados["instituicoes"].sort()
    dados["disciplinas"].sort()
    dados["assuntos"].sort(key=lambda x: (x["disciplina"], x["ordem"]))
    return dados


def gerenciar_assunto(acao, payload, nome_antigo=None):
    wb = load_workbook(ARQ_METADADOS)
    ws = wb["assuntos"]
    todos_assuntos = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0]:
            todos_assuntos.append({
                "nome": str(r[0]),
                "disciplina": str(r[1]),
                "ordem": int(r[2]) if r[2] is not None else 999
            })
    novo_nome = payload["nome"]
    nova_disc = payload["disciplina"]
    raw_ordem = payload.get("ordem")
    if acao == 'editar' and nome_antigo:
        todos_assuntos = [a for a in todos_assuntos if a["nome"] != nome_antigo]
    if raw_ordem is None or raw_ordem == "":
        ordens_existentes = {a["ordem"] for a in todos_assuntos if a["disciplina"] == nova_disc}
        candidato = 1
        while candidato in ordens_existentes: candidato += 1
        nova_ordem = candidato
    else:
        nova_ordem = int(raw_ordem)
        conflito = any(a for a in todos_assuntos if a["disciplina"] == nova_disc and a["ordem"] == nova_ordem)
        if conflito:
            for a in todos_assuntos:
                if a["disciplina"] == nova_disc and a["ordem"] >= nova_ordem: a["ordem"] += 1
    todos_assuntos.append({"nome": novo_nome, "disciplina": nova_disc, "ordem": nova_ordem})
    wb.remove(wb["assuntos"])
    ws_new = wb.create_sheet("assuntos")
    ws_new.append(["nome", "disciplina", "ordem"])
    todos_assuntos.sort(key=lambda x: (x["disciplina"], x["ordem"]))
    for a in todos_assuntos: ws_new.append([a["nome"], a["disciplina"], a["ordem"]])
    wb.save(ARQ_METADADOS)


def salvar_meta_simples(categoria, item_novo, nome_antigo=None):
    wb = load_workbook(ARQ_METADADOS)
    ws = wb[categoria]
    if nome_antigo:
        for row in ws.iter_rows(min_row=2):
            if row[0].value == nome_antigo:
                row[0].value = item_novo["nome"]
                break
    else:
        ws.append([item_novo["nome"]])
    wb.save(ARQ_METADADOS)


def deletar_meta_item(categoria, nome_item):
    wb = load_workbook(ARQ_METADADOS)
    ws = wb[categoria]
    idx_to_del = -1
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if str(row[0]) == str(nome_item):
            idx_to_del = i
            break
    if idx_to_del != -1:
        ws.delete_rows(idx_to_del)
        wb.save(ARQ_METADADOS)
        return True
    return False


# --- ENDPOINTS ---
@app.route("/questoes", methods=["GET"])
def get_q(): return jsonify(carregar_questoes())


@app.route("/questoes", methods=["POST"])
def post_q():
    nova = request.json
    dados = carregar_questoes()
    ne = limpar(nova.get("enunciado")).lower()
    na = limpar(nova.get("alt_a")).lower()
    for q in dados:
        if limpar(q["enunciado"]).lower() == ne and limpar(q["alt_a"]).lower() == na:
            return jsonify({"erro": "Questão duplicada!"}), 409
    if not nova.get("id"):
        ids = sorted([int(q["id"]) for q in dados if str(q["id"]).isdigit()])
        nid = 1
        for i in ids:
            if i == nid:
                nid += 1
            else:
                break
        nova["id"] = nid
    nova.update({"respondidas": 0, "acertos": 0})
    dados.append(nova)
    salvar_questoes(dados)
    return jsonify({"mensagem": "Salvo", "id": nova["id"]})


@app.route("/questoes", methods=["PUT"])
def put_q():
    payload = request.json
    if isinstance(payload, list):
        salvar_questoes(payload)
        return jsonify({"status": "ok"})
    dados = carregar_questoes()
    for i, q in enumerate(dados):
        if str(q["id"]) == str(payload["id"]):
            if "respondidas" not in payload: payload["respondidas"] = q["respondidas"]
            if "acertos" not in payload: payload["acertos"] = q["acertos"]
            payload["id"] = q["id"]
            dados[i] = payload
            salvar_questoes(dados)
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/questoes/<string:id>", methods=["DELETE"])
def del_q(id):
    dados = carregar_questoes()
    novo = [q for q in dados if str(q["id"]) != str(id)]
    salvar_questoes(novo)
    return jsonify({"status": "Removido"})


# --- ENDPOINT UPLOAD PDF ---
@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"erro": "Nome de arquivo inválido"}), 400

    caminho = os.path.join(BASE_DIR, "temp.pdf")
    file.save(caminho)

    try:
        texto = extrair_texto_pdf(caminho)
        questoes = parsear_questoes(texto)
        return jsonify(questoes)
    except Exception as e:
        print(f"Erro no processamento: {str(e)}")
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(caminho):
            os.remove(caminho)


# --- ENDPOINTS METADADOS ---
@app.route("/metadados", methods=["GET"])
def get_meta(): return jsonify(carregar_meta_dict())


@app.route("/metadados/<string:categoria>", methods=["POST"])
def add_meta(categoria):
    item = request.json
    if categoria == "assuntos":
        gerenciar_assunto('criar', item)
    else:
        salvar_meta_simples(categoria, item)
    return jsonify({"status": "ok"})


@app.route("/metadados/<string:categoria>", methods=["PUT"])
def edit_meta(categoria):
    data = request.json
    nome_antigo = data.get("antigo")
    novo_item = data.get("novo")
    if categoria == "assuntos":
        gerenciar_assunto('editar', novo_item, nome_antigo)
    else:
        salvar_meta_simples(categoria, novo_item, nome_antigo)
    return jsonify({"status": "ok"})


@app.route("/metadados/<string:categoria>", methods=["DELETE"])
def del_meta(categoria):
    nome = request.args.get("nome")
    if deletar_meta_item(categoria, nome): return jsonify({"status": "ok"})
    return jsonify({"erro": "Não encontrado"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)