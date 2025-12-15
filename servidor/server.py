from flask import Flask, request, jsonify, send_from_directory
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os
import pdfplumber
import re
import uuid

app = Flask(__name__)
CORS(app)

# --- CONFIGURAÇÕES ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "../banco_de_dados")
UPLOAD_FOLDER = os.path.join(DB_DIR, "img", "q_img")
ARQ_QUESTOES = os.path.join(DB_DIR, "questoes_concurso.xlsx")
ARQ_METADADOS = os.path.join(DB_DIR, "metadados.xlsx")
ARQ_FLASHCARDS = os.path.join(DB_DIR, "flashcards.xlsx")

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- PALAVRAS CHAVE DE CARGO (Apenas para limpeza de metadados da questão) ---
PALAVRAS_CHAVE_CARGO = [
    "ANALISTA", "TÉCNICO", "ENGENHEIRO", "MÉDICO", "ADVOGADO", "AGENTE", "ESCRITURÁRIO",
    "PROFESSOR", "ESPECIALISTA", "AUDITOR", "DEFENSOR", "PROMOTOR", "JUIZ", "DELEGADO",
    "INSPETOR", "SOLDADO", "OFICIAL", "ASSISTENTE", "CONSULTOR", "COORDENADOR", "DIRETOR",
    "GERENTE", "SUPERVISOR", "PEDAGOGO", "PSICÓLOGO", "CONTADOR", "ADMINISTRADOR", "ECONOMISTA",
    "ARQUITETO", "ENFERMEIRO", "FARMACÊUTICO", "NUTRICIONISTA", "DENTISTA"
]


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
    texto = re.sub(r'\n\s*Gabarito:?\s*Letra\s*[A-E]\s*\n', '\n', texto, flags=re.IGNORECASE)
    linhas = [l.strip() for l in texto.split('\n') if l.strip()]
    if not linhas: return ""
    resultado = []
    for i in range(len(linhas)):
        atual = linhas[i]
        if i < len(linhas) - 1:
            proxima = linhas[i + 1]
            pontuacao_final = re.search(r'[.:?!;]$', atual)
            comeca_novo_bloco = re.match(r'^(?:[A-Z"\'\(]|\d+\.|[a-e]\))', proxima)
            if not pontuacao_final and not comeca_novo_bloco:
                resultado.append(atual + " ")
            elif pontuacao_final and comeca_novo_bloco:
                resultado.append(atual + "\n")
            else:
                resultado.append(atual + " ")
        else:
            resultado.append(atual)
    return "".join(resultado).strip()


def gerar_assinatura(q):
    return (
        normalizar_para_comparacao(q.get('enunciado')),
        normalizar_para_comparacao(q.get('alt_a')),
        normalizar_para_comparacao(q.get('alt_b')),
        normalizar_para_comparacao(q.get('alt_c'))
    )


# --- RECONSTRUÇÃO LÓGICA (MATEMÁTICA) ---
def reconstruir_header_logico(texto):
    """
    Reconstrói o cabeçalho usando a lógica: Iniciais da Linha 1 + Palavras da Linha 2.
    """
    # Regex ajustado para capturar as duas linhas do padrão
    pattern = r"([A-Z\s\-\–]+)\n\s*((?:UESTÕES|ISTA|OMENTADAS|ORRELAÇÃO|ESGRANRIO|MPREGO).*)"

    def resolver_match(m):
        # Extrai apenas as letras da primeira linha (ex: ['Q', 'C', 'C', 'V'])
        letras_header = [c for c in m.group(1) if c.isalpha()]
        palavras_quebradas = m.group(2).split()

        # Lista de palavras "inteiras" que devem ser puladas (não consomem letra inicial)
        palavras_inteiras = ["VERBAL", "TRAIÇOEIROS", "PARA", "COM", "DE", "DA", "DO", "DOS", "DAS"]

        resultado = []
        idx_letra = 0

        for palavra in palavras_quebradas:
            p_upper = palavra.upper().strip(".,:;")

            # Se for palavra inteira conhecida ou número, mantém e pula
            if p_upper in palavras_inteiras or re.match(r'^\d+$', p_upper):
                resultado.append(palavra)
                continue

            # Se não tem mais letras no header para usar, mantém a palavra quebrada (melhor que crashar)
            if idx_letra >= len(letras_header):
                resultado.append(palavra)
                continue

            letra_atual = letras_header[idx_letra]

            # CASO ESPECIAL 'E': (ex: Tempos E Modos)
            # Se a letra é 'E' e a palavra atual começa com vogal, é provável que seja um conector isolado
            if letra_atual == 'E' and palavra[0].upper() in "AEIOU":
                # Insere o 'E' como palavra separada e avança para a próxima letra do header
                resultado.append("E")
                idx_letra += 1
                if idx_letra < len(letras_header):
                    letra_atual = letras_header[idx_letra]

            # Junta a letra na palavra
            nova_palavra = letra_atual + palavra
            resultado.append(nova_palavra)
            idx_letra += 1

        return "\n" + " ".join(resultado) + "\n"

    return re.sub(pattern, resolver_match, texto)


def limpar_ruido(texto):
    # 1. Reconstrói o cabeçalho ANTES de qualquer outra limpeza
    texto = reconstruir_header_logico(texto)

    # 2. Remove lixo conhecido
    patterns_to_remove = [
        r"PETROBRAS \(Nível Superior\) Português\s*\d*",
        r"www\.estrategiaconcursos\.com\.br\s*\d*",
        r"\d{11}\s*-\s*Ricardo Aciole",
        r"Equipe Português Estratégia Concursos, Felipe Luccas",
        r"Aula \d+",
        r"==\w+==",
        r"^\.\d+\.\.\)\.",
    ]
    for pattern in patterns_to_remove:
        texto = re.sub(pattern, "", texto, flags=re.MULTILINE | re.IGNORECASE)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto


def extrair_mapa_gabaritos(texto):
    mapa = {}
    padrao_tabela = r'(?:^|\n)\s*(\d+)\.?\s*(?:[Ll][Ee][Tt][Rr][Aa])?\s+([A-E])(?=\s|$)'
    matches = re.finditer(padrao_tabela, texto, re.IGNORECASE)
    for m in matches:
        mapa[m.group(1)] = m.group(2).upper()
    return mapa


def parsear_questoes(texto_bruto):
    texto = limpar_ruido(texto_bruto)
    mapa_gabaritos = extrair_mapa_gabaritos(texto)
    questoes = []
    mapa_assuntos = []

    # 1. IDENTIFICAÇÃO DE ASSUNTOS (SEM PADRONIZAÇÃO FORÇADA)
    # Procura linhas reconstruídas que pareçam cabeçalhos de lista
    regex_topicos = re.compile(
        r'(?:QUESTÕES\s+COMENTADAS|LISTA\s+DE\s+QUESTÕES|LISTA\s+E\s+QUESTÕES).*?[-–—\s]\s*(.*?)\s*(?:[-–—]|$)(?:C\s*)?ESGRANRIO',
        re.IGNORECASE | re.DOTALL
    )

    for match in regex_topicos.finditer(texto):
        trecho_limpo = match.group(1).strip()
        trecho_limpo = trecho_limpo.replace('-', '').replace('–', '').strip()

        # Remove a palavra CESGRANRIO se ela tiver "grudado" no final
        trecho_limpo = re.sub(r'\s*CESGRANRIO$', '', trecho_limpo, flags=re.IGNORECASE).strip()

        # Usa o texto EXATO que foi reconstruído, apenas formatando para Title Case
        assunto_final = trecho_limpo.title()

        # Trava de segurança: Se o assunto reconstruído for muito longo (>60 chars), ignora
        if len(assunto_final) < 60 and len(assunto_final) > 3:
            mapa_assuntos.append({"inicio": match.start(), "assunto": assunto_final})

    # Fallback: Se não achou nenhum cabeçalho, procura termos chave brutos no início do arquivo
    if not mapa_assuntos:
        if "CORRELAÇÃO" in texto.upper()[:3000]:
            mapa_assuntos.append({"inicio": 0, "assunto": "Correlação Verbal"})

    mapa_assuntos.sort(key=lambda x: x["inicio"])

    # 2. SCANNER DE QUESTÕES
    pattern_questao = re.compile(r'^\s*(\d+)\.\s*\((.+?)\)', re.MULTILINE)
    matches_questoes = list(pattern_questao.finditer(texto))

    for i, m in enumerate(matches_questoes):
        start_index = m.start()
        q_numero = m.group(1)
        q_meta = m.group(2)

        if len(q_meta) < 3 or len(q_meta) > 100: continue

        if i + 1 < len(matches_questoes):
            end_index = matches_questoes[i + 1].start()
        else:
            end_index = len(texto)

        q_conteudo_bruto = texto[m.end():end_index]

        # Define Assunto baseado na posição
        assunto_atual = "Geral"
        if mapa_assuntos:
            anteriores = [ma for ma in mapa_assuntos if ma["inicio"] < start_index]
            if anteriores:
                assunto_atual = anteriores[-1]["assunto"]

        meta_limpa = q_meta.replace("–", "/").replace("-", "/")
        partes_meta = [p.strip() for p in meta_limpa.split('/') if p.strip()]
        banca = "CESGRANRIO"
        ano = "2025"
        instituicao = ""

        for p in partes_meta:
            p_upper = p.upper()
            if re.match(r'^\d{4}$', p): ano = p; continue
            if "CESGRANRIO" in p_upper or "ESGRANRIO" in p_upper: banca = "CESGRANRIO"; continue
            if any(cargo in p_upper for cargo in PALAVRAS_CHAVE_CARGO): continue
            if len(p) < 4 and p_upper not in ["BB", "ANP", "STJ", "STF", "AGU", "MPE", "TJ", "TRE", "TRT", "DPE", "PGE",
                                              "PC"]: continue
            if not instituicao or len(p) > len(instituicao): instituicao = p

        gabarito = ""
        gabarito_pattern_local = r'(?:Gabarito|Gab\.?|Letra|Correta)\s*:?\s*([A-E])\s*$'
        matches_gab = list(re.finditer(gabarito_pattern_local, q_conteudo_bruto.strip(), re.IGNORECASE))
        if matches_gab: gabarito = matches_gab[-1].group(1).upper()
        if not gabarito and q_numero in mapa_gabaritos: gabarito = mapa_gabaritos[q_numero]

        content_no_comments = \
        re.split(r"(Comentários?|Comentário:)", q_conteudo_bruto, maxsplit=1, flags=re.IGNORECASE)[0]
        content_no_comments = re.sub(r'www\.estrategia.*', '', content_no_comments)

        parts_alt = re.split(r'\b([A-E])\)', content_no_comments)
        enunciado = sanitizar_texto(parts_alt[0].strip())

        alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
        if len(parts_alt) > 1:
            for k in range(1, len(parts_alt), 2):
                letra = parts_alt[k].upper()
                if k + 1 < len(parts_alt): alts[letra] = sanitizar_texto(parts_alt[k + 1].strip())

        if enunciado and (alts["A"] or alts["B"]):
            questoes.append({
                "temp_id": q_numero, "banca": banca, "instituicao": instituicao, "ano": ano,
                "assunto": assunto_atual, "enunciado": enunciado,
                "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"], "alt_e": alts["E"],
                "gabarito": gabarito, "dificuldade": "Médio", "tipo": "ME", "imagem": ""
            })

    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages:
            texto += (page.extract_text() or "") + "\n"
    return texto


# --- CRUD BASE ---
def verificar_questoes():
    garantir_diretorio()
    if not os.path.exists(ARQ_QUESTOES):
        wb = Workbook();
        ws = wb.active;
        ws.title = "questoes"
        ws.append(
            ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
             "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos", "imagem"])
        wb.save(ARQ_QUESTOES)


def carregar_questoes():
    verificar_questoes();
    wb = load_workbook(ARQ_QUESTOES);
    ws = wb.active;
    dados = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None: continue
        img = row[17] if len(row) > 17 else ""
        dados.append({"id": row[0], "banca": row[1], "instituicao": row[2], "ano": row[3], "enunciado": row[4],
                      "disciplina": row[5], "assunto": row[6], "dificuldade": row[7], "tipo": row[8], "alt_a": row[9],
                      "alt_b": row[10], "alt_c": row[11], "alt_d": row[12], "alt_e": row[13], "gabarito": row[14],
                      "respondidas": row[15] or 0, "acertos": row[16] or 0, "imagem": img})
    return dados


def salvar_questoes(dados):
    wb = Workbook();
    ws = wb.active
    ws.append(
        ["id", "banca", "instituicao", "ano", "enunciado", "disciplina", "assunto", "dificuldade", "tipo", "alt_a",
         "alt_b", "alt_c", "alt_d", "alt_e", "gabarito", "respondidas", "acertos", "imagem"])
    for i in dados: ws.append(
        [i["id"], i.get("banca"), i.get("instituicao"), i.get("ano"), i["enunciado"], i["disciplina"], i["assunto"],
         i["dificuldade"], i["tipo"], i.get("alt_a"), i.get("alt_b"), i.get("alt_c"), i.get("alt_d"), i.get("alt_e"),
         i["gabarito"], i["respondidas"], i["acertos"], i.get("imagem", "")])
    wb.save(ARQ_QUESTOES)


def verificar_flashcards():
    garantir_diretorio()
    if not os.path.exists(ARQ_FLASHCARDS):
        wb = Workbook();
        ws = wb.active;
        ws.title = "flashcards"
        ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"]);
        wb.save(ARQ_FLASHCARDS)


def carregar_flashcards():
    verificar_flashcards();
    wb = load_workbook(ARQ_FLASHCARDS);
    ws = wb.active;
    dados = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0]: dados.append(
            {"id": r[0], "disciplina": r[1], "assunto": r[2], "frente": r[3], "verso": r[4], "acertos": r[5] or 0,
             "erros": r[6] or 0})
    return dados


def salvar_flashcards_dados(dados):
    wb = Workbook();
    ws = wb.active;
    ws.append(["id", "disciplina", "assunto", "frente", "verso", "acertos", "erros"])
    for i in dados: ws.append(
        [i["id"], i["disciplina"], i["assunto"], i["frente"], i["verso"], i["acertos"], i["erros"]])
    wb.save(ARQ_FLASHCARDS)


def verificar_metadados():
    garantir_diretorio()
    if not os.path.exists(ARQ_METADADOS):
        wb = Workbook();
        [wb.create_sheet(n).append(["nome"]) for n in ["bancas", "instituicoes", "disciplinas"]]
        wb.create_sheet("assuntos").append(["nome", "disciplina", "ordem"]);
        wb.save(ARQ_METADADOS)


def carregar_meta_dict():
    verificar_metadados();
    wb = load_workbook(ARQ_METADADOS);
    dados = {"bancas": [], "instituicoes": [], "disciplinas": [], "assuntos": []}
    for k in ["bancas", "instituicoes", "disciplinas"]:
        if k in wb.sheetnames: [dados[k].append(str(r[0])) for r in wb[k].iter_rows(min_row=2, values_only=True) if
                                r[0]]
    if "assuntos" in wb.sheetnames: [
        dados["assuntos"].append({"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] else 999}) for
        r in wb["assuntos"].iter_rows(min_row=2, values_only=True) if r[0]]
    for k in dados: dados[k].sort(key=lambda x: (x["disciplina"], x["ordem"]) if isinstance(x, dict) else x)
    return dados


def salvar_meta_simples(cat, item):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat];
    ws.append([item["nome"]]);
    wb.save(ARQ_METADADOS)


def gerenciar_assunto(acao, payload, nome_antigo=None):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb["assuntos"]
    todos = [{"nome": str(r[0]), "disciplina": str(r[1]), "ordem": int(r[2]) if r[2] else 999} for r in
             ws.iter_rows(min_row=2, values_only=True) if r[0]]
    if acao == 'editar': todos = [a for a in todos if a["nome"] != nome_antigo]
    todos.append(payload);
    wb.remove(wb["assuntos"]);
    ws_new = wb.create_sheet("assuntos");
    ws_new.append(["nome", "disciplina", "ordem"])
    todos.sort(key=lambda x: (x["disciplina"], x["ordem"]));
    [ws_new.append([a["nome"], a["disciplina"], a["ordem"]]) for a in todos];
    wb.save(ARQ_METADADOS)


def deletar_meta_item(cat, nome):
    wb = load_workbook(ARQ_METADADOS);
    ws = wb[cat]
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if str(r[0]) == str(nome): ws.delete_rows(i); wb.save(ARQ_METADADOS); return True
    return False


# --- ROTAS ---
@app.route('/img/q_img/<filename>')
def serve_image(filename): return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/questoes", methods=["GET"])
def get_q(): return jsonify(carregar_questoes())


@app.route("/questoes", methods=["POST"])
def post_q():
    nova = {};
    arq = None
    if request.content_type.startswith('multipart'):
        nova = request.form.to_dict(); arq = request.files.get('imagem_file')
    else:
        nova = request.json
    dados = carregar_questoes();
    nome_img = ""
    if arq and arq.filename:
        ext = arq.filename.rsplit('.', 1)[1].lower();
        nome_img = f"{uuid.uuid4()}.{ext}";
        arq.save(os.path.join(UPLOAD_FOLDER, nome_img));
        nova["imagem"] = nome_img
    else:
        nova["imagem"] = ""
    sig = gerar_assinatura(nova)
    if any(gerar_assinatura(q) == sig for q in dados): return jsonify({"erro": "Duplicada"}), 409
    if not nova.get("id"): ids = sorted([int(q["id"]) for q in dados if str(q["id"]).isdigit()]); nova[
        "id"] = 1 if not ids else (ids[-1] + 1)
    nova.update({"respondidas": 0, "acertos": 0});
    dados.append(nova);
    salvar_questoes(dados)
    return jsonify({"mensagem": "Salvo", "id": nova["id"]}), 201


@app.route("/questoes", methods=["PUT"])
def put_q():
    load = {};
    arq = None
    if request.content_type and request.content_type.startswith('multipart'):
        load = request.form.to_dict(); arq = request.files.get('imagem_file')
    else:
        load = request.json;
    if isinstance(load, list): salvar_questoes(load); return jsonify({"status": "ok"})
    dados = carregar_questoes()
    for i, q in enumerate(dados):
        if str(q["id"]) == str(load["id"]):
            img_antiga = q.get("imagem", "");
            q.update(load)
            if arq and arq.filename:
                ext = arq.filename.rsplit('.', 1)[1].lower();
                nome_img = f"{uuid.uuid4()}.{ext}";
                arq.save(os.path.join(UPLOAD_FOLDER, nome_img));
                q["imagem"] = nome_img
            else:
                if not load.get("imagem"): q["imagem"] = img_antiga
            dados[i] = q;
            salvar_questoes(dados);
            return jsonify({"status": "Atualizado"})
    return jsonify({"erro": "404"}), 404


@app.route("/check-duplicidade", methods=["POST"])
def check_dup():
    payload = request.json;
    sig = gerar_assinatura(payload)
    if not payload.get("enunciado"): return jsonify({"existe": False})
    dados = carregar_questoes();
    return jsonify({"existe": any(gerar_assinatura(q) == sig for q in dados)})


@app.route("/questoes/<string:id>", methods=["DELETE"])
def del_q(id): dados = [q for q in carregar_questoes() if str(q["id"]) != str(id)]; salvar_questoes(
    dados); return jsonify({"status": "Removido"})


@app.route("/flashcards", methods=["GET", "POST", "PUT"])
def handle_fc():
    if request.method == "GET": return jsonify(carregar_flashcards())
    dados = carregar_flashcards();
    load = request.json
    if request.method == "POST":
        if not load.get("id"): ids = sorted([int(f["id"]) for f in dados if str(f["id"]).isdigit()]); load[
            "id"] = 1 if not ids else (ids[-1] + 1)
        load.update({"acertos": 0, "erros": 0});
        dados.append(load);
        salvar_flashcards_dados(dados);
        return jsonify({"mensagem": "Salvo", "id": load["id"]}), 201
    if request.method == "PUT":
        for i, f in enumerate(dados):
            if str(f["id"]) == str(load["id"]): dados[i] = load; salvar_flashcards_dados(dados); return jsonify(
                {"status": "Ok"})
    return jsonify({"erro": "404"}), 404


@app.route("/flashcards/<string:id>", methods=["DELETE"])
def del_fc(id): dados = [f for f in carregar_flashcards() if str(f["id"]) != str(id)]; salvar_flashcards_dados(
    dados); return jsonify({"status": "Ok"})


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    f = request.files.get('file');
    if not f: return jsonify({"erro": "Sem arquivo"}), 400
    p = os.path.join(BASE_DIR, "temp.pdf");
    f.save(p)
    try:
        novas = parsear_questoes(extrair_texto_pdf(p));
        banco = carregar_questoes();
        sigs = {gerar_assinatura(q) for q in banco}
        for n in novas: n['ja_cadastrada'] = gerar_assinatura(n) in sigs
        return jsonify(novas)
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(p): os.remove(p)


@app.route("/metadados", methods=["GET"])
def get_meta(): return jsonify(carregar_meta_dict())


@app.route("/metadados/<string:cat>", methods=["POST", "PUT", "DELETE"])
def handle_meta(cat):
    if request.method == "DELETE": return jsonify({"status": "ok"}) if deletar_meta_item(cat, request.args.get(
        "nome")) else (jsonify({"erro": "404"}), 404)
    data = request.json
    if request.method == "POST":
        if cat == "assuntos":
            gerenciar_assunto('criar', data)
        else:
            salvar_meta_simples(cat, data)
    if request.method == "PUT":
        if cat == "assuntos":
            gerenciar_assunto('editar', data["novo"], data["antigo"])
        else:
            salvar_meta_simples(cat, data["novo"])
    return jsonify({"status": "ok"})


if __name__ == "__main__": app.run(debug=True, port=5000)