################################################################################
#############            CRIAR SIMULADO DE QUESTÕES            #################
################################################################################

lista_de_pdfs = list(portugues = 0:13,
                      ingles = 0:7,
                      con_esp = 0:18,
                      cont_custos = 0:6,
                      cont_ger = 0:12,
                      estatistica = 0:18,
                      mat_fin = 0:7)

criar_sim = function(size_por, size_ing, size_cesp, size_ccus, size_cger,
                     size_est, size_mfin) {
  print("questões de português:")
  print(sort(sample(lista_de_pdfs$portugues, size_por, replace = T)))
  print("questões de ingles:")
  print(sort(sample(lista_de_pdfs$ingles, size_ing, replace = T)))
  print("questões de conhecimentos específicos:")
  print(sort(sample(lista_de_pdfs$con_esp, size_cesp, replace = T)))
  print("questões de contabilidade de custos:")
  print(sort(sample(lista_de_pdfs$cont_custos, size_ccus, replace = T)))
  print("questões de contabilidade gerencial:")
  print(sort(sample(lista_de_pdfs$cont_ger, size_cger, replace = T)))
  print("questões de estatística:")
  print(sort(sample(lista_de_pdfs$estatistica, size_est, replace = T)))
  print("questões de matemárica financeira:")
  print(sort(sample(lista_de_pdfs$mat_fin, size_mfin, replace = T)))
}

criar_sim(size_por = 15,
          size_ing = 5,
          size_cesp = 50,
          size_ccus = 5,
          size_cger = 5,
          size_est = 5,
          size_mfin = 5)
