# Design: para não ter cara de sistema feito por IA

O que denuncia interface gerada: gradiente roxo, tudo em cartão arredondado com sombra,
emoji no lugar de ícone, texto genérico ("Potencialize seu negócio") e três colunas de
"recursos" idênticas. A IA Laura segue o caminho oposto: parece ferramenta de trabalho.

## Identidade
- Mesma família visual da Helô: azul-marinho como base, laranja só como acento.
- Uma cor de acento por tela. Laranja é para a ação principal e nada mais.
- Sem gradientes, sem vidro fosco, sem brilho. Fundo liso.

## Tokens (estão em `apps/web/app/globals.css`)
| Uso | Valor |
| --- | --- |
| Marinho (texto forte, cabeçalhos) | `#12233f` |
| Laranja (ação principal) | `#e8630a` |
| Papel (fundo) | `#f6f4ef` |
| Superfície | `#ffffff` |
| Linha | `#ddd8cd` |
| Texto | `#1c2430` |
| Texto secundário | `#5b6472` |
| Certo / Atenção / Erro | `#1f7a4d` / `#b7791f` / `#b3261e` |

## Tipografia
- Títulos: Bricolage Grotesque. Texto e interface: Public Sans.
- Números de painel em algarismos tabulares (`font-variant-numeric: tabular-nums`).
- Tamanho mínimo de 16px no celular. Hierarquia por peso e tamanho, não por cor.

## Forma
- Raio pequeno: 6px em campos e botões, 10px em painéis. Nada de pílula gigante.
- Borda de 1px no lugar de sombra. Sombra só em menu flutuante e modal.
- Tabelas densas com linhas, não uma grade de cartões. O dono quer ver 20 atendimentos de uma vez.
- Espaçamento em múltiplos de 4. Alinhar à esquerda; centralizar só tela vazia e login.

## Ícones e imagens
- Um conjunto só: Lucide, traço 1.75. Nunca emoji na interface.
- Foto real de técnico, van, bancada. Sem ilustração 3D nem banco de imagem genérico.

## Texto
- Fala de balcão: "Marcar visita", "Técnico a caminho", "Cliente não estava".
- Botão diz o que acontece: "Confirmar para terça de manhã", não "Enviar".
- Sem ponto de exclamação e sem "Ops!". Erro diz o motivo e o próximo passo.
- Status sempre com palavra, nunca só cor.

## Movimento
- Transição de 120 a 160ms, só em opacidade e posição. Sem animação de entrada em cascata.

## Antes de entregar uma tela
1. Funciona em 360px de largura com o polegar?
2. Dá para entender o estado sem ler cor?
3. Tem algum elemento que está ali só para enfeitar? Tire.
