-- Espelho Winthor: tabelas de IDENTIDADE E ACESSO, para o login e as permissões do BI.
--
-- PCSETOR  (13 linhas)     — setor do funcionário; é o que sugere o papel no BI
--                            (DIRETORIA, COMPRAS, FINANCEIRO/TESOURARIA, VENDEDORES...).
-- PCROTINA (1.560 linhas)  — nome e módulo de cada rotina do ERP.
-- PCCONTRO (14.672 linhas) — a ACL REAL do WinThor (usuário x rotina x acesso). É ela que
--                            responde "quem já usa a apuração de faturamento no ERP" e vira
--                            sugestão de permissão no BI.
--
-- Sem estas três a tela de usuários continua funcionando: o papel cai numa legenda escrita
-- no código e o botão de sugerir permissão pelo ERP fica indisponível, com aviso na tela.
-- Espelhá-las tira essa legenda do código e devolve a verdade para o banco.
--
-- Aplicar (Postgres do BI, com o agente já atualizado):
--   docker compose exec -T postgres psql -U h4c -d h4c -v ON_ERROR_STOP=1 < este_arquivo.sql
--   e depois: python sync/agente.py PCSETOR PCROTINA PCCONTRO

SET search_path TO winthor, public;

-- PCSETOR
DROP TABLE IF EXISTS winthor."pcsetor" CASCADE;
CREATE TABLE winthor."pcsetor" (
  "codsetor" integer,
  "descricao" varchar(30),
  "usamyfrota" varchar(1),
  "dtultalter" timestamp
);

-- PCROTINA
DROP TABLE IF EXISTS winthor."pcrotina" CASCADE;
CREATE TABLE winthor."pcrotina" (
  "codigo" integer,
  "nomerotina" varchar(40),
  "acao" varchar(250),
  "ajuda" varchar(1000),
  "codmodulo" integer,
  "codsubmodulo" integer,
  "log" varchar(1),
  "numseq" integer,
  "nivel" integer,
  "status" varchar(1),
  "numultversao" numeric(4,2),
  "dtultversao" timestamp,
  "exibirmenu" varchar(1),
  "qtutilizacao" bigint,
  "dtultutilizacao" timestamp,
  "dtpriutilizacao" timestamp,
  "codfuncultutil" integer,
  "dataexe" timestamp,
  "autmenu" bigint,
  "versaocompleta" varchar(20),
  "utilizacontrolebiometrico" varchar(1),
  "fiid" varchar(50),
  "versaoexeant" varchar(20),
  "versaoexeatual" varchar(20),
  "hashcodemd5" varchar(32),
  "rotinaweb" varchar(1),
  "rotina" varchar(45),
  "datasincronizacao" timestamp
);

-- PCCONTRO
DROP TABLE IF EXISTS winthor."pccontro" CASCADE;
CREATE TABLE winthor."pccontro" (
  "codusuario" integer,
  "codrotina" integer,
  "acesso" varchar(1),
  "codbanco" integer,
  "codmoeda" varchar(4),
  "codepto" integer
);
