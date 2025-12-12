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


# ... (Mantenha as funções de DIRETÓRIO e ARQUIVOS iguais: garantir_diretorio, limpar, verificar_questoes, carregar_questoes, salvar_questoes, metadados...) ...

# --- NOVA LÓGICA DE EXTRAÇÃO DE PDF ---

def limpar_ruido(texto):
    """
    Remove cabeçalhos e rodapés repetitivos do Estratégia/PDFs de concurso
    para evitar que quebrem o texto das questões no meio.
    """
    linhas = texto.split('\n')
    linhas_limpas = []

    # Padrões de ruído comuns no texto enviado
    padroes_ruido = [
        r"^\s*Aula \d+\s*$",
        r"^\s*PETROBRAS \(Nível Superior\)\s*$",
        r"^\s*Equipe Português Estratégia Concursos.*$",
        r"^\s*www\.estrategiaconcursos\.com\.br\s*$",
        r"^\d{2,}\s*de\s*\d{2,}$",  # Numeração de página ex: 36 de 61
        r"^\d+$",  # Apenas número (página)
        r"^\d{11}\s*-\s*Ricardo Aciole",  # CPF/Nome no rodapé
    ]

    for linha in linhas:
        eh_ruido = False
        for p in padroes_ruido:
            if re.search(p, linha, re.IGNORECASE):
                eh_ruido = True
                break
        if not eh_ruido:
            linhas_limpas.append(linha)

    return "\n".join(linhas_limpas)


def parsear_questoes(texto_bruto):
    # 1. Limpeza inicial
    texto = limpar_ruido(texto_bruto)

    questoes = []

    # 2. Regex para identificar o início de uma questão
    # Padrão observado: "1. (CESGRANRIO..." ou "10. (CESGRANRIO..."
    # O grupo 1 pega o número, o grupo 2 pega a Banca/Instituição dentro do parêntese
    regex_inicio = re.compile(r'\n\s*(\d+)\.\s*\((.*?)\)\s*')

    # Divide o texto com base no início das questões
    # O split vai retornar algo como: [Lixo, Num1, Banca1, Conteudo1, Num2, Banca2, Conteudo2...]
    partes = regex_inicio.split(texto)

    if len(partes) < 4:
        # Tenta fallback para padrão sem parênteses se necessário, ou retorna vazio
        return []

    # Começa do índice 1 (pula o texto introdutório da aula)
    # Passo de 3 em 3: (Número, Banca, Conteúdo)
    for i in range(1, len(partes) - 2, 3):
        numero = partes[i]
        banca_crua = partes[i + 1]  # Ex: CESGRANRIO/UNIRIO/Assistente...
        conteudo_bruto = partes[i + 2]

        # Tenta separar o enunciado das alternativas e do comentário
        # Primeiro, verificamos se há um bloco de "Comentários" ou "Gabarito"
        # Usamos split para isolar o enunciado+alternativas do comentário
        split_comentario = re.split(r'(?:\n\s*Comentários:|\n\s*Gabarito)', conteudo_bruto, flags=re.IGNORECASE)

        bloco_questao = split_comentario[0]
        texto_comentario = split_comentario[1] if len(split_comentario) > 1 else ""

        # Regex para capturar alternativas A), B), C)...
        # Procura por "A)" ou "a)" no início de linha ou após espaço
        regex_alt = re.compile(r'(?:^|\n)\s*([A-E])\)\s+')
        partes_alt = regex_alt.split(bloco_questao)

        enunciado = partes_alt[0].strip()
        alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}

        if len(partes_alt) > 1:
            for k in range(1, len(partes_alt), 2):
                letra = partes_alt[k].upper()
                txt_alt = partes_alt[k + 1].strip()
                if letra in alts:
                    alts[letra] = txt_alt

        # Tentar extrair o gabarito do texto do comentário ou do final
        # Padrão comum no texto: "Gabarito: Letra A" ou "Gabarito letra A" ou "GABARITO \n 1. LETRA A"
        gabarito = ""

        # Busca no comentário (comum em "Questões Comentadas")
        match_gab = re.search(r'Gabarito[:\s]+(?:Letra\s+)?([A-E])', texto_comentario, re.IGNORECASE)
        if match_gab:
            gabarito = match_gab.group(1).upper()

        # Se não achou, busca no próprio bloco (às vezes o gabarito está solto no final)
        if not gabarito:
            match_gab_solto = re.search(r'Gabarito[:\s]+([A-E])', conteudo_bruto, re.IGNORECASE)
            if match_gab_solto:
                gabarito = match_gab_solto.group(1).upper()

        # Limpeza fina da Banca (pegar só a primeira parte se tiver barras)
        banca_final = banca_crua.split('/')[0].strip()

        # Monta o objeto
        q_obj = {
            "temp_id": numero,
            "banca": banca_final,
            "ano": "",  # Difícil extrair com precisão absoluta sem padrão rígido, deixamos vazio ou tentamos regex
            "enunciado": enunciado,
            "alt_a": alts["A"],
            "alt_b": alts["B"],
            "alt_c": alts["C"],
            "alt_d": alts["D"],
            "alt_e": alts["E"],
            "gabarito": gabarito,
            "dificuldade": "Médio",  # Padrão
            "tipo": "ME"
        }

        # Filtro básico: só adiciona se tiver enunciado e pelo menos 2 alternativas
        if enunciado and (alts["A"] or alts["B"]):
            questoes.append(q_obj)

    return questoes


def extrair_texto_pdf(caminho_arquivo):
    texto_completo = ""
    with pdfplumber.open(caminho_arquivo) as pdf:
        for page in pdf.pages:
            # layout=True ajuda a manter a estrutura visual, importante para tabelas,
            # mas para texto corrido as vezes atrapalha. Vamos testar sem primeiro.
            texto_completo += (page.extract_text() or "") + "\n"
    return texto_completo


# ... (Restante dos Endpoints iguais ao anterior) ...

# Endpoint de Upload (Certifique-se que está usando as novas funções)
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
        print(e)  # Log para debug no terminal
        return jsonify({"erro": str(e)}), 500
    finally:
        if os.path.exists(caminho):
            os.remove(caminho)


# ... (Main) ...
if __name__ == "__main__":
    app.run(debug=True, port=5000)