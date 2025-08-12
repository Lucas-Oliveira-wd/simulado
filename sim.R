################################################################################
#############            CRIAR SIMULADO DE QUESTÕES            #################
################################################################################

lista_de_pdfs = list(portugues = 0:12,
                      ingles = 0:7,
                      con_esp = c(0:21,31:33),
                      cont_custos = 0:6,
                      cont_ger = 0:5,
                      financas = 0:1,
                      mat_fin_estat = 0:10)

criar_sim = function(size_por, size_ing, size_cesp, size_ccus, size_cger,
                     size_financ, size_mfin_est) {
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
  print("questões de finanças:")
  print(sort(sample(lista_de_pdfs$financas, size_financ, replace = T)))
  print("questões de matemárica financeira e estatística:")
  print(sort(sample(lista_de_pdfs$mat_fin_estat, size_mfin_est, replace = T)))
}

criar_sim(size_por = 15,
          size_ing = 5,
          size_cesp = 30,
          size_ccus = 5,
          size_cger = 5,
          size_financ = 5,
          size_mfin_est = 5)
