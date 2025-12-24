from flask import Flask, request, jsonify, send_from_directory
from openpyxl import load_workbook, Workbook
from flask_cors import CORS
import os
import pdfplumber
import re
import uuid

# --- CONFIGURAÇÃO ---
# Coloque aqui o nome exato do arquivo PDF que está falhando
pdf_ing = (f"G:/Meu Drive/aprendizado/concursos/eng.producao/petrobras/estrategia_concursos/pdfs/02.ingles/"
               f"01-Substantivos, Artigos, Pronomes, Preposições e Resolução de Provas.pdf")

pdf_por = (f"G:/Meu Drive/aprendizado/concursos/eng.producao/petrobras/estrategia_concursos/pdfs/01.lingua-portuguesa/"
           f"13-Compreensão e interpretação de textos. Tipologia textual. Reescrita de frases e parágrafos do texto.pdf")

def extrair_texto_bruto(caminho_pdf):
    texto_completo = ""

    if not os.path.exists(caminho_pdf):
        print(f"❌ Erro: O arquivo '{caminho_pdf}' não foi encontrado.")
        return None

    print(f"📂 Abrindo: {caminho_pdf}")

    try:
        with pdfplumber.open(caminho_pdf) as pdf:
            total = len(pdf.pages)
            print(f"📄 Total de páginas: {total}")

            for i, page in enumerate(pdf.pages):
                # Extração crua, exatamente como o server.py faz
                texto_pagina = page.extract_text()

                if texto_pagina:
                    texto_completo += texto_pagina + "\n"
                else:
                    texto_completo += f"\n[AVISO: Página {i + 1} retornou texto vazio]\n"

                print(f"⏳ Lendo página {i + 1}/{total}...", end="\r")

        print("\n✅ Leitura concluída.")
        return texto_completo

    except Exception as e:
        print(f"\n❌ Erro crítico ao ler o PDF: {e}")
        return None

def limpar(texto):
    return str(texto).strip() if texto else ""

# --- NOVA FUNÇÃO: LIMPEZA PROFUNDA AO SALVAR ---
def normalizar_texto_para_banco(texto):
    if not texto: return ""
    txt = str(texto)

    # 1. Remove caracteres de retorno de carro do Windows (\r)
    txt = txt.replace('\r\n', '\n').replace('\r', '\n')

    # 2. Remove espaços em branco no final de cada linha
    txt = re.sub(r'[ \t]+\n', '\n', txt)

    # Remove espaços em branco no início de cada linha
    txt = re.sub(r'\n[ \t]+', '\n', txt)

    # 3. Colapsa 3 ou mais quebras de linha em apenas 1 (para manter parágrafo, mas sem buracos)
    txt = re.sub(r'\n{3,}', '\n\n', txt)

    return txt.strip()


def sanitizar_texto(texto):
    if not texto: return ""
    # Remove hifens soltos de quebra de página
    texto = re.sub(r'-\s*\n\s*', '', texto)

    # Remove linhas isoladas de gabarito que possam ter sobrado (ex: em questões comentadas)
    # Mas cuidado para não remover partes do enunciado. O foco aqui é limpar "sujeira"
    texto = re.sub(r'\n\s*Gabarito:?\s*Letra\s*[A-E]\s*\n', '\n', texto, flags=re.IGNORECASE)

    linhas = [l.strip() for l in texto.split('\n') if l.strip()]
    if not linhas: return ""
    resultado = []
    for i in range(len(linhas)):
        atual = linhas[i]
        if i < len(linhas) - 1:
            proxima = linhas[i + 1]
            pontuacao_final = re.search(r'[.:?!;]$', atual)
            # Verifica se a próxima linha parece um novo bloco (começa com letra maiúscula ou número)
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


# --- RECONSTRUÇÃO DE TEXTO ---
def reconstruir_header_logico(texto):
    pattern = r"([A-Z\s\-\–]+)\n\s*((?:UESTÕES|ISTA).*)"

    def resolver_match(m):
        raw_letras = m.group(1)
        raw_palavras = m.group(2)
        matches_guia = list(re.finditer(r'([A-Z]|-)', raw_letras))
        palavras_quebradas = raw_palavras.split()
        stopwords = ["VERBAL", "TRAIÇOEIROS", "PARA", "COM", "DE", "DA", "DO", "DOS", "DAS", "EM", "QUE", "SE"]
        resultado_final = ""
        idx_p2 = 0
        for i, match in enumerate(matches_guia):
            token = match.group(1)
            termo_para_adicionar = token
            if token != '-':
                while idx_p2 < len(palavras_quebradas):
                    palavra_atual = palavras_quebradas[idx_p2]
                    if palavra_atual.upper().strip(".,:;") in stopwords:
                        resultado_final += palavra_atual + " "
                        idx_p2 += 1
                    else:
                        break
                if idx_p2 < len(palavras_quebradas):
                    termo_para_adicionar = token + palavras_quebradas[idx_p2]
                    idx_p2 += 1
            resultado_final += termo_para_adicionar
            if i < len(matches_guia) - 1:
                fim_atual = match.end()
                inicio_prox = matches_guia[i + 1].start()
                if inicio_prox > fim_atual:
                    resultado_final += " "
        if idx_p2 < len(palavras_quebradas):
            resultado_final += " " + " ".join(palavras_quebradas[idx_p2:])
        return "\n" + re.sub(r'\s+', ' ', resultado_final).strip() + "\n"

    return re.sub(pattern, resolver_match, texto)

def limpar_ruido(texto, disciplina=""):
    texto = reconstruir_header_logico(texto)
    # Normaliza a palavra GABARITO que pode vir espaçada ou quebrada
    texto = re.sub(r'G\s*\n?\s*A\s*B\s*A\s*R\s*I\s*T\s*O', 'Gabarito', texto, flags=re.IGNORECASE)

    patterns_to_remove = [
        r"PETROBRAS \(Nível Superior\) Português\s*\d*",
        r"www\.estrategiaconcursos\.com\.br\s*\d*",
        r".*Ricardo Aciole.*",
        r"^\s*\d+\s*$", # REMOVE LINHAS QUE SÃO APENAS NÚMEROS
        r"Equipe Português Estratégia Concursos, Felipe Luccas",
        r"Aula \d+",
        r"==\w+==",
        r"^\.\d+\.\.\)\.",
        r"10763321451",
    ]
    if disciplina == "Conhecimentos Específicos":
        patterns_to_remove.extend([
            r"PETROBRAS \(Engenharia de Produção\)",
            r"Conhecimentos Específicos",
            r"Daniel Almeida",
            r".*Felipe Canella.*"
        ])
    elif disciplina == "Inglês":
        patterns_to_remove.extend([
            r"PETROBRAS \(Nível Superior\) Inglês",
            r"Ena Smith",
            r"Available at:.*",
            r"^\d+\s*de\s*[A-Z][a-z]+\s*de\s*\d+",  # Datas
        ])

    for pattern in patterns_to_remove:
        texto = re.sub(pattern, "", texto, flags=re.MULTILINE | re.IGNORECASE)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto


def extrair_mapa_gabaritos_local(texto_bloco):

    mapa = {}
    # Procura por número + (ponto/traço opcional) + (LETRA opcional) + A-E
    # Ex: "1. A", "1. Letra A", "01 - A"
    padrao_tabela = r'\b(\d+)[\.\-\s]+\s*(?:[Ll][Ee][Tt][Rr][Aa])?\s*([A-E]|Certo|Errado|C|E)(?=[\s\d\.\-]|$)'
    matches = re.finditer(padrao_tabela, texto_bloco, re.IGNORECASE)
    for m in matches:
        val = m.group(2).upper()
        if val == "CERTO": val = "C"
        elif val == "ERRADO": val = "E"
        mapa[m.group(1)] = val
    return mapa

def parsear_questoes(texto_bruto, disciplina=""):
    texto_limpo = limpar_ruido(texto_bruto, disciplina)
    questoes = []

    if disciplina == "Português" or disciplina == "Conhecimentos Específicos":

        # Segmentação por Blocos Lógicos
        regex_divisao_blocos = re.compile(
            r'((?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES)(?:.|\n)+?)(?=(?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES)|$)',
            re.IGNORECASE)

        blocos = [m.group(1) for m in regex_divisao_blocos.finditer(texto_limpo)]

        if not blocos:
            blocos = [texto_limpo]

        assunto_atual = "Geral"

        for bloco in blocos:
            # Detecta o assunto do bloco pelo título
            match_titulo = re.match(r'((?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES).+?)(?:\n|$)', bloco,
                                re.IGNORECASE)

            if match_titulo:
                linha_completa = match_titulo.group(1).strip()
                idx_primeiro_hifen = linha_completa.find('-')
                idx_ultimo_hifen = linha_completa.rfind('-')
                if idx_primeiro_hifen != -1 and idx_ultimo_hifen != -1 and idx_primeiro_hifen < idx_ultimo_hifen:
                    assunto_raw = linha_completa[idx_primeiro_hifen + 1: idx_ultimo_hifen].strip()
                    assunto_atual = re.sub(r'Cesgranrio', '', assunto_raw.title(), flags=re.IGNORECASE).strip()
                elif "CORRELAÇÃO" in linha_completa.upper():
                    assunto_atual = "Correlação Verbal"
                elif "SINTÁTICAS" in linha_completa.upper():
                    assunto_atual = "Funções Sintáticas"
                elif "SEMÂNTICO" in linha_completa.upper():
                    assunto_atual = "Campo Semântico"
                elif "SINÔNIMO" in linha_completa.upper():
                    assunto_atual = "Sinônimos e Antônimos"
                elif "DENOTAÇÃO" in linha_completa.upper():
                    assunto_atual = "Denotação e Conotação"

            banca = "CESGRANRIO"
            instituicao = ""
            ano = "2025"

            # Extrai o mapa de respostas contido neste bloco (agora pega inline também)
            mapa_gabaritos_local = extrair_mapa_gabaritos_local(bloco)

            if disciplina == "Português":
                # Regex estrita para identificar início de questão
                pattern_questao = re.compile(
                    r'^\s*(\d+)\.\s*(?:\(?)\s*((?:\(|CESGRANRIO|FGV|CEBRASPE|FCC|VUNESP|INSTITUTO|BANCO|PETROBRAS|EQUIPE|[A-Z][a-zçãõâêô]+).+?)\s*(?:\)?)\s*$',
                    re.MULTILINE
                )
            elif disciplina == "Conhecimentos Específicos":
                # Sem ^ (início de linha) e sem $ (fim de linha). Pega inline.
                pattern_questao = re.compile(r'(?:^|\n)\s*(\d+)\s*[\.\-\)]\s*(\(.*?\))', re.MULTILINE)
            matches_questoes = list(pattern_questao.finditer(bloco))

            # --- Extração do Conteúdo do Texto de Apoio ---
            texto_apoio_bloco = ""

            for i, m in enumerate(matches_questoes):
                q_numero = m.group(1)
                q_meta = m.group(2)

                if disciplina == "Português":
                    # Filtro para evitar falsos positivos (como "1. Noções..." no índice)
                    if not re.search(r'^\(|CESGRANRIO|FGV|CEBRASPE|FCC|VUNESP|INSTITUTO|BANCO|PETROBRAS',
                                     q_meta.upper().strip()):
                        continue
                elif disciplina == "Conhecimentos Específicos":
                    if len(q_meta) < 3:
                        continue


                start_index = m.end()
                end_index = matches_questoes[i + 1].start() if i + 1 < len(matches_questoes) else len(bloco)

                q_conteudo_bruto = bloco[start_index:end_index]

                # Remover tabela de gabarito do final do texto da questão
                # Se encontrar "Gabarito 1." ou "Gabarito 1 ", corta o texto ali.
                # Isso evita que a tabela vá para a Alternativa E da última questão.
                q_conteudo_bruto = re.split(r'\n\s*Gabarito\s+1[\.\s]', q_conteudo_bruto, flags=re.IGNORECASE)[0]

                # INSERÇÃO: Detecção Universal de Certo/Errado
                tipo = "ME"
                if re.search(r'\(\s*\)\s*(?:Certo|Errado)|(?:Certo|Errado)\s*\(\s*\)|julgue\s+o\s+item|julgue\s+os\s+itens', q_conteudo_bruto, re.IGNORECASE):
                    tipo = "CE"

                # Processamento de metadados (Banca, Ano, etc)
                # CORREÇÃO: Busca o ano via regex (19xx ou 20xx) antes de quebrar a string
                match_ano = re.search(r'\b(19|20)\d{2}\b', q_meta)
                if match_ano:
                    ano = match_ano.group(0)

                # Remove o ano encontrado da string para limpar a área para Banca/Instituição
                meta_sem_ano = q_meta
                if match_ano:
                    meta_sem_ano = q_meta.replace(ano, "")

                meta_limpa = meta_sem_ano.replace("–", "/").replace("-", "/")

                # Removemos parênteses extras que podem sobrar após a limpeza
                partes_meta = [p.strip().replace('(', '').replace(')', '') for p in meta_limpa.split('/') if p.strip()]

                # Filtra strings vazias resultantes
                partes_meta = [p for p in partes_meta if p.strip()]

                if len(partes_meta) > 0:
                    banca_cand = partes_meta[0].replace('(', '')
                    if len(banca_cand) > 2: banca = banca_cand
                if len(partes_meta) > 1: instituicao = partes_meta[1].replace(')', '')

                # Busca Gabarito
                gabarito = ""
                # 1. Prioridade: Comentário local (questões comentadas)
                if disciplina == "Português":
                    gabarito_pattern_local = r'(?:Gabarito|Gab\.?|Letra|Correta)[:\s\.]+\s*([A-E])'
                else:
                    # 2. [A-E](?![a-z]): Pega a letra A-E SÓ SE não tiver letra minúscula depois (Evita o A de Alternativa).
                    gabarito_pattern_local = r'(?:Gabarito|Gab\.?|Letra|Correta)[:\s\.]+\s*(?:(?:Alternativa|Opção)\s+)?(?:[\"“\']\s*)?([A-Ea-e])(?:[\"”\']\.?)?(?![a-z])'
                matches_gab = list(re.finditer(gabarito_pattern_local, q_conteudo_bruto.strip(), re.IGNORECASE))
                if matches_gab:
                    gab_raw = matches_gab[-1].group(1).upper()
                    if gab_raw in ["CERTO", "C"]:
                        gabarito = "C"
                    elif gab_raw in ["ERRADO", "E"]:
                        gabarito = "E"
                    else:
                        gabarito = gab_raw

                # 2. Fallback: Mapa local (listas de questões)
                # Só usa se não achou no comentário E se não parece ter comentário no texto
                if not gabarito and q_numero in mapa_gabaritos_local:
                    if "Comentário" not in q_conteudo_bruto and "COMENTÁRIO" not in q_conteudo_bruto.upper():
                        gabarito = mapa_gabaritos_local[q_numero]

                # Separa Enunciado e Alternativas
                content_no_comments = \
                re.split(r"(Comentários?|Comentário:)", q_conteudo_bruto, maxsplit=1, flags=re.IGNORECASE)[0]
                content_no_comments = re.sub(r'www\.estrategia.*', '', content_no_comments)

                # Separação Enunciado/Alternativas
                if tipo == "CE":
                    enunciado = re.sub(r'\(\s*\)\s*(?:Certo|Errado)|(?:Certo|Errado)\s*\(\s*\)', '', content_no_comments,
                                       flags=re.IGNORECASE)
                    enunciado = sanitizar_texto(enunciado)
                    alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
                else:
                    # --- CORREÇÃO PARA FORMATO (A), (B)... ---
                    if disciplina == "Conhecimentos Específicos" or disciplina == "Inglês":
                        content_no_comments = re.sub(r'(?:^|\s)\(([A-E])\)(?=\s)', r'\n\1)', content_no_comments)

                    parts_alt = re.split(r'\b([A-E])\)', content_no_comments, flags=re.IGNORECASE)
                    enunciado = sanitizar_texto(parts_alt[0].strip())
                    alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
                    if len(parts_alt) > 1:
                        for k in range(1, len(parts_alt), 2):
                            letra = parts_alt[k].upper()
                            if k + 1 < len(parts_alt):
                                alts[letra] = sanitizar_texto(parts_alt[k + 1].strip())

                if enunciado:
                    if (tipo == "ME" and (alts["A"] or alts["B"])) or (tipo == "CE"):
                        questoes.append({
                            "temp_id": str(uuid.uuid4()),
                            "banca": banca, "instituicao": instituicao, "ano": ano,
                            "assunto": assunto_atual, "enunciado": enunciado,
                            "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"],
                            "alt_e": alts["E"],
                            "gabarito": gabarito, "dificuldade": "Médio", "tipo": tipo, "imagem": "",
                            "texto_apoio_conteudo": texto_apoio_bloco if disciplina == "Inglês" else ""
                        })



    elif disciplina == "Inglês":

        # Segmentação por Blocos Lógicos
        regex_divisao_blocos = re.compile(
            r'((?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES)(?:.|\n)+?)(?=(?:QUESTÕES\s+COMENTADAS|LISTA\s+(?:DE|E)\s+QUESTÕES)|$)',
            re.IGNORECASE)

        blocos = [m.group(1) for m in regex_divisao_blocos.finditer(texto_limpo)]

        if not blocos:
            blocos = [texto_limpo]

        assunto_atual = "Interpretação de Texto"

        for bloco in blocos:

            banca = "CESGRANRIO"
            instituicao = ""
            ano = "2025"

            # O regex busca: Qualquer coisa -> Hífen/Travessão -> (Instituição) -> Hífen/Travessão -> (Banca)
            match_meta_ing = re.search(r'.+?\s*[-–]\s*(.+?)\s*[-–]\s*(.+?)\s*(?:\n|$)', bloco[:600])
            if match_meta_ing:
                instituicao = match_meta_ing.group(1).strip()  # Grupo 1: BNDES
                banca = match_meta_ing.group(2).strip()  # Grupo 2: CESGRANRIO
            # Extrai o mapa de respostas contido neste bloco (agora pega inline também)
            mapa_gabaritos_local = extrair_mapa_gabaritos_local(bloco)

            pattern_questao = re.compile(r'(?:^|\n)\s*(\d+)\s+(?=[A-Z])', re.MULTILINE)
            matches_questoes = list(pattern_questao.finditer(bloco))

            # --- Extração do Conteúdo do Texto de Apoio ---
            texto_apoio_bloco = ""
            if disciplina == "Inglês":
                # Tenta pegar tudo até "Comentários" ou até a 1ª questão
                if re.search(r'Comentários?:', bloco, re.IGNORECASE):
                    texto_apoio_bloco = re.split(r'Comentários?:', bloco, maxsplit=1, flags=re.IGNORECASE)[0]
                elif matches_questoes:
                    idx_start = matches_questoes[0].start()
                    texto_apoio_bloco = bloco[:idx_start]
                texto_apoio_bloco = texto_apoio_bloco.strip()

            for i, m in enumerate(matches_questoes):
                q_numero = m.group(1)

                q_meta = ""

                start_index = m.end()
                end_index = matches_questoes[i + 1].start() if i + 1 < len(matches_questoes) else len(bloco)

                q_conteudo_bruto = bloco[start_index:end_index]

                # Remover tabela de gabarito do final do texto da questão
                # Se encontrar "Gabarito 1." ou "Gabarito 1 ", corta o texto ali.
                # Isso evita que a tabela vá para a Alternativa E da última questão.
                q_conteudo_bruto = re.split(r'\n\s*Gabarito\s+1[\.\s]', q_conteudo_bruto, flags=re.IGNORECASE)[0]

                # INSERÇÃO: Detecção Universal de Certo/Errado
                tipo = "ME"
                if re.search(
                        r'\(\s*\)\s*(?:Certo|Errado)|(?:Certo|Errado)\s*\(\s*\)|julgue\s+o\s+item|julgue\s+os\s+itens',
                        q_conteudo_bruto, re.IGNORECASE):
                    tipo = "CE"

                # Busca Gabarito
                gabarito = ""
                # 1. Prioridade: Comentário local (questões comentadas)
                # 2. [A-E](?![a-z]): Pega a letra A-E SÓ SE não tiver letra minúscula depois (Evita o A de Alternativa).
                gabarito_pattern_local = r'(?i)(?:Gabarito|Gab\.?|Letra|Correta)[:\s\.\-–]+\s*(?:(?:Alternativa|Opção)\s+)?(?:[\"“\'\s]*)?([A-E]|Certo|Errado|C|E)(?![a-z])'
                matches_gab = list(re.finditer(gabarito_pattern_local, q_conteudo_bruto.strip(), re.IGNORECASE))
                if matches_gab:
                    gab_raw = matches_gab[-1].group(1).upper()
                    if gab_raw in ["CERTO", "C"]:
                        gabarito = "C"
                    elif gab_raw in ["ERRADO", "E"]:
                        gabarito = "E"
                    else:
                        gabarito = gab_raw

                # 2. Fallback: Mapa local (listas de questões)
                # Só usa se não achou no comentário E se não parece ter comentário no texto
                if not gabarito and q_numero in mapa_gabaritos_local:
                    if "Comentário" not in q_conteudo_bruto and "COMENTÁRIO" not in q_conteudo_bruto.upper():
                        gabarito = mapa_gabaritos_local[q_numero]

                # Separa Enunciado e Alternativas
                content_no_comments = \
                    re.split(r"(Comentários?|Comentário:)", q_conteudo_bruto, maxsplit=1, flags=re.IGNORECASE)[0]
                content_no_comments = re.sub(r'www\.estrategia.*', '', content_no_comments)

                # Separação Enunciado/Alternativas
                if tipo == "CE":
                    enunciado = re.sub(r'\(\s*\)\s*(?:Certo|Errado)|(?:Certo|Errado)\s*\(\s*\)', '',
                                       content_no_comments,
                                       flags=re.IGNORECASE)
                    enunciado = sanitizar_texto(enunciado)
                    alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
                else:
                    # --- CORREÇÃO PARA FORMATO (A), (B)... ---
                    content_no_comments = re.sub(r'(?:^|\s)\(([A-E])\)(?=\s)', r'\n\1)', content_no_comments)

                    parts_alt = re.split(r'\b([A-E])\)', content_no_comments, flags=re.IGNORECASE)
                    enunciado = sanitizar_texto(parts_alt[0].strip())
                    alts = {"A": "", "B": "", "C": "", "D": "", "E": ""}
                    if len(parts_alt) > 1:
                        for k in range(1, len(parts_alt), 2):
                            letra = parts_alt[k].upper()
                            if k + 1 < len(parts_alt):
                                alts[letra] = sanitizar_texto(parts_alt[k + 1].strip())

                if enunciado:
                    if (tipo == "ME" and (alts["A"] or alts["B"])) or (tipo == "CE"):
                        questoes.append({
                            "temp_id": str(uuid.uuid4()),
                            "banca": banca, "instituicao": instituicao, "ano": ano,
                            "assunto": assunto_atual, "enunciado": enunciado,
                            "alt_a": alts["A"], "alt_b": alts["B"], "alt_c": alts["C"], "alt_d": alts["D"],
                            "alt_e": alts["E"],
                            "gabarito": gabarito, "dificuldade": "Médio", "tipo": tipo, "imagem": "",
                            "texto_apoio_conteudo": texto_apoio_bloco if disciplina == "Inglês" else ""
                        })

    return questoes

def test_dir(disc):
    if disc == "por":
        texto_full = extrair_texto_bruto(pdf_por)
        for q in list(range(1, 11)):
            print(f'Questão {q}: {parsear_questoes(texto_full, "Português")[q]}')
    elif disc == "ing":
        texto_full = extrair_texto_bruto(pdf_ing)
        for q in list(range(1, 11)):
            print(f'Questão {q}: {parsear_questoes(texto_full, "Inglês")[q]}')

test_dir("ing")