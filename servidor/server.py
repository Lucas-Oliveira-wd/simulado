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


# --- FUNÇÕES UTILITÁRIAS ---
def garantir_diretorio():
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)


def limpar(texto):
    return str(texto).strip() if texto else ""


# --- LÓGICA DE EXTRAÇÃO DE PDF (REVISADA) ---
def limpar_ruido(texto):
    """
    Remove cabeçalhos, rodapés e artefatos de PDF que quebram o texto.
    """
    # Remove linhas de paginação soltas (ex: "36" ou "36 de 61")
    texto = re.sub(r'\n\s*\d+(\s*de\s*\d+)?\s*\n', '\n', texto)

    # Remove o rodapé constante com CPF/Nome do aluno (Crucial para não quebrar frases)
    texto = re.sub(r'\n\s*\d{11}\s*-\s*Ricardo Aciole.*?\n', '\n', texto, flags=re.IGNORECASE)

    # Remove cabeçalhos repetitivos do Estratégia
    padroes = [
        r"PETROBRAS \(Nível Superior\) Português",
        r"www\.estrategiaconcursos\.com\.br",
        r"Equipe Português Estratégia Concursos",
        r"Aula \d+"
    ]
    for p in padroes:
        texto = re.sub(fr'\n\s*{p}.*?\n', '\n', texto, flags=re.IGNORECASE)

    # Remove artefatos estranhos (ex: ==2e5d94==)
    texto = re.sub(r'==[a-f0-9]+==', '', texto)

    return texto


def parsear_questoes(texto_bruto):
    # 1. Limpeza prévia
    texto = limpar_ruido(texto_bruto)
    questoes = []

    # 2. Regex Principal (SCANNER)
    # Procura: Quebra de linha -> Número -> Ponto -> (Conteúdo Parenteses)
    # O Lookahead (?=\n\s*\d+\.\s*\() garante que pegamos tudo até a próxima questão começar
    regex_quest = re.compile(r'(?:^|\n)\s*(\d+)\.\s*\((.*?)\)\s*(.*?)(?=\n\s*\d+\.\s*\(|$)', re.DOTALL)

    for match in regex_quest.finditer(texto):
        numero = match.group(1)
        banca_crua = match.group(2)  # Ex: CESGRANRIO / UNIRIO...
        conteudo_bruto = match.group(3)

        # --- FILTRO ANTI-RUÍDO (Falsos Positivos) ---
        # Se não tiver "CESGRANRIO" ou barras "/" no cabeçalho, é tópico de aula, ignora.
        if 'CESGRANRIO' not in banca_crua.upper() and '/' not in banca_crua:
            continue

        # --- EXTRAÇÃO INTELIGENTE DO GABARITO ---
        # Busca o gabarito em QUALQUER lugar do bloco antes de limpar.
        gabarito = ""
        # Regex flexível para: "Gabarito letra A", "Gabarito: A", "Gabarito. Letra A."
        match_gab = re.search(r'Gabarito[:\.\s-]*(?:Letra)?\s*([A-E])', conteudo_bruto, re.IGNORECASE)
        if match_gab:
            gabarito = match_gab.group(1).upper()

        # --- LIMPEZA E SEPARAÇÃO ---

        # 1. Separa o bloco de Comentários/Gabarito do Enunciado+Alternativas
        conteudo_limpo = re.split(r'(?:\n\s*Comentários:|\n\s*Gabarito)', conteudo_bruto, flags=re.IGNORECASE)[0]

        # 2. Separa Alternativas (A), B), etc)
        regex_alt = re.compile(r'(?:^|\n)\s*([A-E])\)\s+')
        partes_alt = regex_alt.split(conteudo_limpo)

        enunciado = partes_alt[0].strip()
        alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}

        if len(partes_alt) > 1:
            for k in range(1, len(partes_alt), 2):
                letra = partes_alt[k].upper()
                txt_alt = partes_alt[k + 1].strip()

                # --- FAXINA NA ALTERNATIVA ---
                # Remove "Gabarito Letra X" se tiver sobrado grudado no final da frase
                txt_alt = re.sub(r'Gabarito.*$', '', txt_alt, flags=re.IGNORECASE | re.DOTALL).strip()
                # Remove pontuação solta ou lixo final
                txt_alt = txt_alt.rstrip(' .;-')

                if letra in alts:
                    alts[letra] = txt_alt

        # Extrai Ano e Banca limpa
        ano = "2025"
        match_ano = re.search(r'20\d{2}', banca_crua)
        if match_ano: ano = match_ano.group(0)

        banca_final = banca_crua.split('/')[0].strip()

        # Validação final para salvar
        if enunciado and (alts["A"] or alts["B"]):
            questoes.append({
                "temp_id": numero,
                "banca": banca_final,
                "ano": ano,
                "enunciado": enunciado,
                "alt_a": alts["A"],
                "alt_b": alts["B"],
                "alt_c": alts["C"],
                "alt_d": alts["D"],
                "alt_e": alts["E"],
                "gabarito": gabarito,
                "dificuldade": "Médio",
                "tipo": "ME"
            })

    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto_completo = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages:
            texto_completo += (page.extract_text() or "") + "\n"
    return texto_completo


# --- GERENCIAMENTO DE QUESTÕES (CRUD) ---
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