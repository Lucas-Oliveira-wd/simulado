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
ARQ_FLASHCARDS = os.path.join(DB_DIR, "flashcards.xlsx")

# --- MAPA DE CORREÇÃO DE TÓPICOS ---
CORRECAO_ASSUNTOS = {
    "MPREGO OS EMPOS ODOS": "Emprego de Tempos e Modos",
    "ODO NDICATIVO": "Modo Indicativo",
    "ERBOS TRAIÇOEIROS": "Verbos Traiçoeiros",
    "MPREGO OS EMPOS E ODOS": "Emprego de Tempos e Modos",
    "UBSTANTIVO": "Substantivo", "DJETIVO": "Adjetivo", "DVÉRBIO": "Advérbio",
    "RTIGO": "Artigo", "NTERJEIÇÃO": "Interjeição", "UMERAL": "Numeral",
    "RONOME": "Pronome", "ERBO": "Verbo", "ONJUNÇÃO": "Conjunção",
    "REPOSIÇÃO": "Preposição", "ALAVRAS SPECIAIS": "Palavras Especiais",
    "OLOCAÇÃO RONOMINAL": "Colocação Pronominal", "RONOMES": "Pronomes",
    "OLOCAÇÃO PRONOMINAL": "Colocação Pronominal"
}


# --- FUNÇÕES UTILITÁRIAS ---
def garantir_diretorio():
    if not os.path.exists(DB_DIR): os.makedirs(DB_DIR, exist_ok=True)


def limpar(texto):
    return str(texto).strip() if texto else ""


def normalizar_para_comparacao(texto):
    if not texto: return ""
    texto_sem_tags = re.sub(r'<[^>]+>', '', str(texto))
    return re.sub(r'[\W_]+', '', texto_sem_tags).lower()


def sanitizar_texto(texto):
    if not texto: return ""
    texto = re.sub(r'-\s*\n\s*', '', texto)
    linhas = [l.strip() for l in texto.split('\n') if l.strip()]
    if not linhas: return ""
    resultado = []
    for i in range(len(linhas)):
        atual = linhas[i]
        if i < len(linhas) - 1:
            proxima = linhas[i + 1]
            pontuacao_final = re.search(r'[.:?!;]$', atual)
            comeca_novo_bloco = re.match(r'^(?:[A-Z"\'\(]|\d+\.|[a-e]\))', proxima)
            if pontuacao_final and comeca_novo_bloco:
                resultado.append(atual + "\n")
            else:
                resultado.append(atual + " ")
        else:
            resultado.append(atual)
    return "".join(resultado)


# --- LÓGICA DE EXTRAÇÃO ---
def limpar_ruido(texto):
    patterns_to_remove = [
        r"PETROBRAS \(Nível Superior\) Português\s*\d*",
        r"www\.estrategiaconcursos\.com\.br\s*\d*",
        r"\d{11}\s*-\s*Ricardo Aciole",
        r"Equipe Português Estratégia Concursos, Felipe Luccas",
        r"Aula \d+",
        r"==\w+==",
        r"^\s*\d+\s*$"
    ]
    cleaned_text = texto
    for pattern in patterns_to_remove:
        cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.MULTILINE | re.IGNORECASE)
    cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)
    return cleaned_text


def extrair_mapa_gabaritos(texto):
    mapa = {}
    padrao_tabela = r'(?:^|\n)\s*(\d+)\.?\s*(?:[Ll][Ee][Tt][Rr][Aa])?\s+([A-E])(?=\s|$)'
    matches = re.finditer(padrao_tabela, texto, re.IGNORECASE)
    for m in matches:
        num = m.group(1)
        letra = m.group(2).upper()
        mapa[num] = letra
    return mapa


def parsear_questoes(texto_bruto):
    texto = limpar_ruido(texto_bruto)
    mapa_gabaritos = extrair_mapa_gabaritos(texto)
    questoes = []
    mapa_assuntos = []

    # 1. CAPTURA DE ASSUNTOS
    regex_topicos = re.compile(
        r'(?:UESTÕES\s+OMENTADAS|ISTA\s+E\s+UESTÕES).*?([A-ZÃÕÁÉÍÓÚÇÂÊÔÀ\s\-]+?)\s*(?:C\s*)?ESGRANRIO',
        re.IGNORECASE | re.DOTALL
    )
    for match in regex_topicos.finditer(texto):
        trecho_assunto = match.group(1).replace('\n', ' ').replace('-', '').strip()
        assunto_corrigido = CORRECAO_ASSUNTOS.get(trecho_assunto)
        if not assunto_corrigido:
            assunto_corrigido = CORRECAO_ASSUNTOS.get(trecho_assunto.replace("  ", " "))
        if not assunto_corrigido and len(trecho_assunto) > 3:
            assunto_corrigido = trecho_assunto.title()
        if assunto_corrigido:
            mapa_assuntos.append({"inicio": match.start(), "assunto": assunto_corrigido})
    mapa_assuntos.sort(key=lambda x: x["inicio"])

    # 2. CAPTURA DE QUESTÕES
    question_split_pattern = r"(\d+)\.\s*\((CESGRANRIO.*?)\)"
    parts = re.split(question_split_pattern, texto)

    if len(parts) > 1:
        current_pos_tracker = len(parts[0])

        for i in range(1, len(parts), 3):
            if (i + 2) >= len(parts): break

            q_numero = parts[i].strip()
            q_meta = parts[i + 1].strip()
            q_conteudo_bruto = parts[i + 2]

            current_pos_tracker += len(q_numero) + len(q_meta) + len(q_conteudo_bruto)

            assunto_atual = "Geral"
            if mapa_assuntos:
                anteriores = [m for m in mapa_assuntos if m["inicio"] < current_pos_tracker]
                if anteriores: assunto_atual = anteriores[-1]["assunto"]

            banca = "CESGRANRIO"
            ano = "2025"
            instituicao = ""
            ano_match = re.search(r'\b20\d{2}\b', q_meta)
            if ano_match: ano = ano_match.group(0)
            meta_clean = q_meta.replace(banca, "").replace(ano, "").replace("-", "").strip()
            instituicao = meta_clean.strip(" /")

            gabarito = ""
            gabarito_pattern_local = r'(?:Gabarito|GABARITO|Correta|Letra)(?:.{0,30}?)(?:[Ll]etra|[Oo]pção|[Aa]lternativa)?\s*([A-E])(?=[\.\s]|$)'
            matches_gab = list(re.finditer(gabarito_pattern_local, q_conteudo_bruto, re.IGNORECASE))
            if matches_gab:
                gabarito = matches_gab[-1].group(1).upper()

            if not gabarito and q_numero in mapa_gabaritos:
                gabarito = mapa_gabaritos[q_numero]

            content_no_comments = \
            re.split(r"(Comentários?|Comentário:)", q_conteudo_bruto, maxsplit=1, flags=re.IGNORECASE)[0]
            content_no_comments = \
            re.split(r'\n\s*(?:L\s*I\s*S\s*T\s*A|GABARITO)', content_no_comments, flags=re.IGNORECASE)[0]

            parts_alt = re.split(r'\b([A-E])\)', content_no_comments)
            enunciado = sanitizar_texto(parts_alt[0].strip())

            alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
            if len(parts_alt) > 1:
                for k in range(1, len(parts_alt), 2):
                    letra = parts_alt[k].upper()
                    if k + 1 < len(parts_alt):
                        alts[letra] = sanitizar_texto(parts_alt[k + 1].strip().rstrip('.;'))

            if enunciado and (alts["A"] or alts["B"]):
                questoes.append({
                    "temp_id": q_numero, "banca": banca, "instituicao": instituicao, "ano": ano,
                    "assunto": assunto_atual, "enunciado": enunciado,
                    "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"], "alt_e": alts["E"],
                    "gabarito": gabarito, "dificuldade": "Médio", "tipo": "ME"
                })

    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages:
            texto += (page.extract_text() or "") + "\n"
    return texto


# --- CRUD QUESTÕES ---
def verificar_questoes():
    garantir_diretorio()
    if not os.path.exists(ARQ_QUESTOES):
        wb = Workbook()
        ws = wb.active;
        ws.title = "questoes"
        ws.append(
            ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
             "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos"])
        wb.save(ARQ_QUESTOES)


def carregar_questoes():
    verificar_questoes()
    wb = load_workbook(ARQ_QUESTOES);
    ws = wb.active
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        dados.append({
            "id": row[0], "banca": row[1], "instituicao": row[2], "ano": row[3],
            "enunciado": row[4], "disciplina": row[5], "assunto": row[6],
            "dificuldade": row[7], "tipo": row[8],
            "alt_a": row[9], "alt_b": row[10], "alt_c": row[11], "alt_d": row[12], "alt_e": row[13],
            "gabarito": row[14], "respondidas": row[15] or 0, "acertos": row[16] or 0
        })
    return dados


def salvar_questoes(dados):
    wb = Workbook();
    ws = wb.active
    ws.append(
        ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
         "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos"])
    for item in dados:
        ws.append([item["id"], item.get("banca"), item.get("instituicao"), item.get("ano"), item["enunciado"],
                   item["disciplina"], item["assunto"], item["dificuldade"], item["tipo"], item.get("alt_a"),
                   item.get("alt_b"), item.get("alt_c"), item.get("alt_d"), item.get("alt_e"), item["gabarito"],
                   item["respondidas"], item["acertos"]])
    wb.save(ARQ_QUESTOES)


# --- CRUD FLASHCARDS ---
def verificar_flashcards():
    garantir_diretorio()
    if not os.path.exists(ARQ_FLASHCARDS):
        wb = Workbook();
        ws = wb.active;
        ws.title = "flashcards"
        ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"])
        wb.save(ARQ_FLASHCARDS)


def carregar_flashcards():
    verificar_flashcards()
    wb = load_workbook(ARQ_FLASHCARDS);
    ws = wb.active
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        dados.append({"id": row[0], "disciplina": row[1], "assunto": row[2], "frente": row[3], "verso": row[4],
                      "acertos": row[5] or 0, "erros": row[6] or 0})
    return dados


def salvar_flashcards_dados(dados):
    wb = Workbook();
    ws = wb.active
    ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"])
    for item in dados: ws.append(
        [item["id"], item["disciplina"], item["assunto"], item["frente"], item["verso"], item["acertos"],
         item["erros"]])
    wb.save(ARQ_FLASHCARDS)


# --- METADADOS ---
def verificar_metadados():
    garantir_diretorio()
    if not os.path.exists(ARQ_METADADOS):
        wb = Workbook()
        ws1 = wb.active;
        ws1.title = "bancas";
        ws1.append(["nome"])
        for b in ["Cesgranrio", "Cebraspe", "FGV", "Vunesp", "FCC"]: ws1.append([b])
        ws2 = wb.create_sheet("instituicoes");
        ws2.append(["nome"])
        for i in ["Petrobras", "Transpetro", "Banco do Brasil", "Caixa"]: ws2.append([i])
        ws3 = wb.create_sheet("disciplinas");
        ws3.append(["nome"])
        for d in ["Português", "Matemática", "Raciocínio Lógico", "Informática",
                  "Conhecimentos Específicos"]: ws3.append([d])
        ws4 = wb.create_sheet("assuntos");
        ws4.append(["nome", "disciplina", "ordem"])
        ws4.append(["Crase", "Português", 1]);
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
            if r[0]: dados["assuntos"].append(
                {"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] is not None else 999})
    dados["bancas"].sort();
    dados["instituicoes"].sort();
    dados["disciplinas"].sort()
    dados["assuntos"].sort(key=lambda x: (x["disciplina"], x["ordem"]))
    return dados


def gerenciar_assunto(acao, payload, nome_antigo=None):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb["assuntos"]
    todos = [{"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] is not None else 999} for r in
             ws.iter_rows(min_row=2, values_only=True) if r[0]]
    if acao == 'editar' and nome_antigo: todos = [a for a in todos if a["nome"] != nome_antigo]
    novo = payload;
    raw_ord = novo.get("ordem")
    if raw_ord is None or raw_ord == "":
        ords = {a["ordem"] for a in todos if a["disciplina"] == novo["disciplina"]}
        cand = 1;
        while cand in ords: cand += 1
        novo["ordem"] = cand
    else:
        novo["ordem"] = int(raw_ord)
    todos.append(novo)
    wb.remove(wb["assuntos"]);
    ws_new = wb.create_sheet("assuntos");
    ws_new.append(["nome", "disciplina", "ordem"])
    todos.sort(key=lambda x: (x["disciplina"], x["ordem"]))
    for a in todos: ws_new.append([a["nome"], a["disciplina"], a["ordem"]])
    wb.save(ARQ_METADADOS)


def salvar_meta_simples(cat, item, ant=None):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat]
    if ant:
        for r in ws.iter_rows(min_row=2):
            if r[0].value == ant: r[0].value = item["nome"]; break
    else:
        ws.append([item["nome"]])
    wb.save(ARQ_METADADOS)


def deletar_meta_item(cat, nome):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat]
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if str(r[0]) == str(nome): ws.delete_rows(i); wb.save(ARQ_METADADOS); return True
    return False


# --- NOVO ENDPOINT DE VERIFICAÇÃO DINÂMICA ---
@app.route("/check-duplicidade", methods=["POST"])
def check_duplicidade():
    payload = request.json
    enunciado = normalizar_para_comparacao(payload.get("enunciado"))
    alt_a = normalizar_para_comparacao(payload.get("alt_a"))

    if not enunciado: return jsonify({"existe": False})

    questoes_banco = carregar_questoes()
    for q in questoes_banco:
        if normalizar_para_comparacao(q['enunciado']) == enunciado and normalizar_para_comparacao(q['alt_a']) == alt_a:
            return jsonify({"existe": True})

    return jsonify({"existe": False})


# --- ROTAS PADRÃO ---
@app.route("/questoes", methods=["GET"])
def get_q(): return jsonify(carregar_questoes())


@app.route("/questoes", methods=["POST"])
def post_q():
    nova = request.json;
    dados = carregar_questoes()
    ne = normalizar_para_comparacao(nova.get("enunciado"));
    na = normalizar_para_comparacao(nova.get("alt_a"))
    if any(normalizar_para_comparacao(q["enunciado"]) == ne and normalizar_para_comparacao(q["alt_a"]) == na for q in
           dados):
        return jsonify({"erro": "Duplicada"}), 409
    if not nova.get("id"):
        ids = sorted([int(q["id"]) for q in dados if str(q["id"]).isdigit()])
        nova["id"] = 1 if not ids else (ids[-1] + 1)
    nova.update({"respondidas": 0, "acertos": 0});
    dados.append(nova);
    salvar_questoes(dados)
    return jsonify({"mensagem": "Salvo", "id": nova["id"]}), 201


@app.route("/questoes", methods=["PUT"])
def put_q():
    load = request.json
    if isinstance(load, list): salvar_questoes(load); return jsonify({"status": "ok"})
    dados = carregar_questoes()
    for i, q in enumerate(dados):
        if str(q["id"]) == str(load["id"]):
            q.update(load);
            dados[i] = q;
            salvar_questoes(dados);
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/questoes/<string:id>", methods=["DELETE"])
def del_q(id):
    dados = [q for q in carregar_questoes() if str(q["id"]) != str(id)]
    salvar_questoes(dados);
    return jsonify({"status": "Removido"})


@app.route("/flashcards", methods=["GET"])
def get_fc(): return jsonify(carregar_flashcards())


@app.route("/flashcards", methods=["POST"])
def post_fc():
    nova = request.json;
    dados = carregar_flashcards()
    if not nova.get("id"):
        ids = sorted([int(f["id"]) for f in dados if str(f["id"]).isdigit()])
        nova["id"] = 1 if not ids else (ids[-1] + 1)
    nova.update({"acertos": 0, "erros": 0});
    dados.append(nova);
    salvar_flashcards_dados(dados)
    return jsonify({"mensagem": "Salvo", "id": nova["id"]}), 201


@app.route("/flashcards", methods=["PUT"])
def put_fc():
    load = request.json;
    dados = carregar_flashcards()
    for i, f in enumerate(dados):
        if str(f["id"]) == str(load["id"]):
            dados[i] = load;
            salvar_flashcards_dados(dados);
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/flashcards/<string:id>", methods=["DELETE"])
def del_fc(id):
    dados = [f for f in carregar_flashcards() if str(f["id"]) != str(id)]
    salvar_flashcards_dados(dados);
    return jsonify({"status": "Removido"})


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    if 'file' not in request.files: return jsonify({"erro": "Sem arquivo"}), 400
    f = request.files['file']
    p = os.path.join(BASE_DIR, "temp.pdf")
    f.save(p)
    try:
        novas_questoes = parsear_questoes(extrair_texto_pdf(p))
        questoes_banco = carregar_questoes()
        assinaturas_banco = set()
        for q in questoes_banco:
            sig = (normalizar_para_comparacao(q['enunciado']), normalizar_para_comparacao(q['alt_a']))
            assinaturas_banco.add(sig)
        for nova in novas_questoes:
            sig_nova = (normalizar_para_comparacao(nova['enunciado']), normalizar_para_comparacao(nova['alt_a']))
            if sig_nova in assinaturas_banco:
                nova['ja_cadastrada'] = True
            else:
                nova['ja_cadastrada'] = False
        return jsonify(novas_questoes)
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(p): os.remove(p)


@app.route("/metadados", methods=["GET"])
def get_meta(): return jsonify(carregar_meta_dict())


@app.route("/metadados/<string:cat>", methods=["POST"])
def add_meta(cat):
    item = request.json
    if cat == "assuntos":
        gerenciar_assunto('criar', item)
    else:
        salvar_meta_simples(cat, item)
    return jsonify({"status": "ok"})


@app.route("/metadados/<string:cat>", methods=["PUT"])
def edit_meta(cat):
    d = request.json
    if cat == "assuntos":
        gerenciar_assunto('editar', d["novo"], d["antigo"])
    else:
        salvar_meta_simples(cat, d["novo"], d["antigo"])
    return jsonify({"status": "ok"})


@app.route("/metadados/<string:cat>", methods=["DELETE"])
def del_meta(cat):
    if deletar_meta_item(cat, request.args.get("nome")): return jsonify({"status": "ok"})
    return jsonify({"erro": "404"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5000)