-- Remove do espelho as colunas de CREDENCIAL e DOCUMENTO PESSOAL.
--
-- Por que é urgente: o espelho roda num servidor exposto na internet e recebeu, sem
-- nenhuma finalidade analítica, PCEMPR.SENHABD (o criptograma da senha do WinThor dos
-- 26 usuários que têm senha), além de CPF, RG, CTPS, PIS e nome dos pais. PCEMPR só
-- foi espelhada para resolver o nome do comprador.
--
-- ORDEM CORRETA (o inverso quebra o sincronismo):
--   1. atualize e reconstrua o AGENTE primeiro, para ele parar de enviar as colunas:
--        cd /home/h4c/h4c-bi && git pull && cd sync && docker compose up -d --build
--   2. só então rode este arquivo no Postgres do BI;
--   3. o VACUUM FULL no fim reescreve a tabela — sem ele os bytes da senha continuam
--      no arquivo de dados mesmo depois do DROP COLUMN.
--
-- A trava que impede a reincidência está em sync/config.py (COLUNAS_PROIBIDAS), e vale
-- para toda tabela nova: a proteção é por NOME de coluna, não por lista de tabela.

SET search_path TO winthor, public;

-- PCFILIAL: 5 coluna(s)
ALTER TABLE winthor."pcfilial" DROP COLUMN IF EXISTS "senhabancodadoswms";
ALTER TABLE winthor."pcfilial" DROP COLUMN IF EXISTS "senhaserv";
ALTER TABLE winthor."pcfilial" DROP COLUMN IF EXISTS "senhaproxy";
ALTER TABLE winthor."pcfilial" DROP COLUMN IF EXISTS "senhacertificado";
ALTER TABLE winthor."pcfilial" DROP COLUMN IF EXISTS "hubpassword";

-- PCCLIENT: 5 coluna(s)
ALTER TABLE winthor."pcclient" DROP COLUMN IF EXISTS "senha_web";
ALTER TABLE winthor."pcclient" DROP COLUMN IF EXISTS "rg";
ALTER TABLE winthor."pcclient" DROP COLUMN IF EXISTS "cpfconjuge";
ALTER TABLE winthor."pcclient" DROP COLUMN IF EXISTS "rgconj";
ALTER TABLE winthor."pcclient" DROP COLUMN IF EXISTS "senhaconvecf";

-- PCUSUARI: 9 coluna(s)
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "senha";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "cpf";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "senhapop";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "senhadialup";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "senhalogin";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "senhaftp";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "cpfaux";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "cpftitularcc";
ALTER TABLE winthor."pcusuari" DROP COLUMN IF EXISTS "cpftitularcp";

-- PCFORNEC: 4 coluna(s)
ALTER TABLE winthor."pcfornec" DROP COLUMN IF EXISTS "rg";
ALTER TABLE winthor."pcfornec" DROP COLUMN IF EXISTS "cpfcontatoverba";
ALTER TABLE winthor."pcfornec" DROP COLUMN IF EXISTS "rgcontatoverba";
ALTER TABLE winthor."pcfornec" DROP COLUMN IF EXISTS "cpfprodutorrural";

-- PCSUPERV: 1 coluna(s)
ALTER TABLE winthor."pcsuperv" DROP COLUMN IF EXISTS "cpf";

-- PCGERENTE: 1 coluna(s)
ALTER TABLE winthor."pcgerente" DROP COLUMN IF EXISTS "cpf";

-- PCEMPR: 15 coluna(s)
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "senhabd";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "cpf";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "rg";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "ctps";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "pis";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "dtexpirasenha";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "cnh";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "nomepai";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "nomemae";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "senhahash";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "senhamyaudit";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "senhamybi";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "senhagogeo";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "hashsenhawinthor";
ALTER TABLE winthor."pcempr" DROP COLUMN IF EXISTS "alterarsenhaproximologin";

-- PCPEDI: 1 coluna(s)
ALTER TABLE winthor."pcpedi" DROP COLUMN IF EXISTS "cpfresptecnicoagrigola";

-- reescreve os arquivos de dados (o DROP COLUMN sozinho não apaga os bytes)
VACUUM FULL winthor."pcfilial";
VACUUM FULL winthor."pcclient";
VACUUM FULL winthor."pcusuari";
VACUUM FULL winthor."pcfornec";
VACUUM FULL winthor."pcsuperv";
VACUUM FULL winthor."pcgerente";
VACUUM FULL winthor."pcempr";
VACUUM FULL winthor."pcpedi";
