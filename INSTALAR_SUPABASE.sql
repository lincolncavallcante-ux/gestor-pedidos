-- MINI FORGE 64 | Loja integrada v1
-- Requer as tabelas public.clientes e public.pedidos com coluna itens (migração v2).
-- NÃO altera nem exclui clientes, pedidos, recebimentos ou políticas anteriores.
-- Execute na MESMA base de dados já usada pelo Gestor de Pedidos.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mf64_loja_config (
  slug text PRIMARY KEY DEFAULT 'miniforge64' CHECK (slug = 'miniforge64'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Mini Forge 64',
  descricao text NOT NULL DEFAULT 'Miniaturas, personagens e acessórios sob encomenda',
  whatsapp text NOT NULL DEFAULT '',
  ativa boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Identifica a conta que já é proprietária dos pedidos cadastrados.
-- Se houver mais de uma conta, confira o usuário identificado no SELECT final.
INSERT INTO public.mf64_loja_config (slug, user_id)
SELECT 'miniforge64', user_id
  FROM public.pedidos
 GROUP BY user_id
 ORDER BY count(*) DESC
 LIMIT 1
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mf64_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  categoria text NOT NULL DEFAULT 'Miniaturas' CHECK (length(categoria) BETWEEN 1 AND 60),
  descricao text NOT NULL DEFAULT '' CHECK (length(descricao) <= 1200),
  preco numeric(12,2) NOT NULL CHECK (preco >= 0 AND preco <= 100000),
  imagem_url text NOT NULL DEFAULT '' CHECK (length(imagem_url) <= 1200),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mf64_produtos_user_idx ON public.mf64_produtos(user_id, created_at DESC);

-- UUID aleatório emitido pelo navegador evita pedido duplicado após recarregar.
-- Esta tabela NÃO é exposta publicamente para leitura.
CREATE TABLE IF NOT EXISTS public.mf64_checkout_ids (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mf64_checkout_recent_idx ON public.mf64_checkout_ids(user_id, telefone, created_at DESC);

ALTER TABLE public.mf64_loja_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf64_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf64_checkout_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mf64_config_publica ON public.mf64_loja_config;
CREATE POLICY mf64_config_publica ON public.mf64_loja_config FOR SELECT TO anon
  USING (ativa);
DROP POLICY IF EXISTS mf64_config_admin_select ON public.mf64_loja_config;
CREATE POLICY mf64_config_admin_select ON public.mf64_loja_config FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR ativa);
DROP POLICY IF EXISTS mf64_config_admin_update ON public.mf64_loja_config;
CREATE POLICY mf64_config_admin_update ON public.mf64_loja_config FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS mf64_produtos_publicos ON public.mf64_produtos;
CREATE POLICY mf64_produtos_publicos ON public.mf64_produtos FOR SELECT TO anon
  USING (ativo AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = mf64_produtos.user_id AND c.ativa));
DROP POLICY IF EXISTS mf64_produtos_admin_select ON public.mf64_produtos;
CREATE POLICY mf64_produtos_admin_select ON public.mf64_produtos FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (ativo AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = mf64_produtos.user_id AND c.ativa)));
DROP POLICY IF EXISTS mf64_produtos_admin_insert ON public.mf64_produtos;
CREATE POLICY mf64_produtos_admin_insert ON public.mf64_produtos FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS mf64_produtos_admin_update ON public.mf64_produtos;
CREATE POLICY mf64_produtos_admin_update ON public.mf64_produtos FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = (SELECT auth.uid())))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS mf64_produtos_admin_delete ON public.mf64_produtos;
CREATE POLICY mf64_produtos_admin_delete ON public.mf64_produtos FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = (SELECT auth.uid())));

REVOKE ALL ON public.mf64_loja_config, public.mf64_produtos, public.mf64_checkout_ids FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.mf64_loja_config, public.mf64_produtos TO anon;
GRANT SELECT, UPDATE ON public.mf64_loja_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mf64_produtos TO authenticated;

-- Se existir Storage, cria bucket público para as fotos do catálogo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mf64-produtos', 'mf64-produtos', true, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS mf64_fotos_publicas ON storage.objects;
CREATE POLICY mf64_fotos_publicas ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'mf64-produtos');
DROP POLICY IF EXISTS mf64_fotos_upload ON storage.objects;
CREATE POLICY mf64_fotos_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mf64-produtos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.mf64_loja_config c WHERE c.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS mf64_fotos_remover ON storage.objects;
CREATE POLICY mf64_fotos_remover ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mf64-produtos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- A lógica que grava pedidos usa privilégios de banco e não é exposta na Data API.
CREATE SCHEMA IF NOT EXISTS mf64_private;

CREATE OR REPLACE FUNCTION mf64_private.finalizar_pedido(
  p_nome text, p_telefone text, p_email text, p_observacoes text,
  p_itens jsonb, p_solicitacao uuid, p_verificacao text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
  v_user uuid;
  v_whatsapp text;
  v_nome text;
  v_telefone text;
  v_email text;
  v_obs text;
  v_item jsonb;
  v_id uuid;
  v_nome_produto text;
  v_preco numeric(12,2);
  v_qtd integer;
  v_total numeric(12,2) := 0;
  v_itens jsonb := '[]'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_cliente uuid;
  v_pedido uuid;
  v_pedido_antigo uuid;
BEGIN
  IF nullif(btrim(coalesce(p_verificacao,'')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitação inválida.';
  END IF;
  v_nome := btrim(coalesce(p_nome, ''));
  v_telefone := pg_catalog.regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g');
  v_email := btrim(coalesce(p_email, ''));
  v_obs := btrim(coalesce(p_observacoes,''));
  IF length(v_nome) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'Informe o nome completo.'; END IF;
  IF length(v_telefone) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'Informe um número de WhatsApp válido, com DDD.'; END IF;
  IF length(v_email) > 160 OR (length(v_email) > 0 AND v_email NOT LIKE '%@%.%') THEN RAISE EXCEPTION 'E-mail inválido.'; END IF;
  IF length(v_obs) > 500 THEN RAISE EXCEPTION 'As observações devem ter até 500 caracteres.'; END IF;
  IF p_solicitacao IS NULL THEN RAISE EXCEPTION 'Identificador da solicitação inválido.'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Selecione entre 1 e 30 produtos.';
  END IF;
  SELECT c.user_id, c.whatsapp INTO v_user, v_whatsapp
    FROM public.mf64_loja_config c
   WHERE c.slug = 'miniforge64' AND c.ativa = true;
  IF v_user IS NULL OR length(v_whatsapp) NOT BETWEEN 12 AND 13 THEN
    RAISE EXCEPTION 'A loja não está pronta para receber pedidos.';
  END IF;

  -- Bloqueio transacional por UUID: dois cliques não criam duas encomendas.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_solicitacao::text, 0));
  SELECT pedido_id INTO v_pedido_antigo FROM public.mf64_checkout_ids WHERE id = p_solicitacao;
  IF v_pedido_antigo IS NOT NULL THEN
    RETURN jsonb_build_object('pedido_id', v_pedido_antigo, 'repetido', true, 'whatsapp', v_whatsapp);
  END IF;
  -- Limite simples por telefone; não substitui CAPTCHA/rate limiting no servidor.
  IF EXISTS (SELECT 1 FROM public.mf64_checkout_ids t
             WHERE t.user_id = v_user AND t.telefone = v_telefone
               AND t.created_at > now() - interval '20 seconds') THEN
    RAISE EXCEPTION 'Aguarde alguns segundos para enviar outro pedido.';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_itens)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'Item inválido.'; END IF;
    IF (v_item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Produto inválido.';
    END IF;
    v_id := (v_item->>'id')::uuid;
    IF v_id = ANY(v_ids) THEN RAISE EXCEPTION 'Não repita o mesmo produto. Ajuste a quantidade.'; END IF;
    v_ids := pg_catalog.array_append(v_ids, v_id);
    IF (v_item->>'quantidade') !~ '^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
    v_qtd := (v_item->>'quantidade')::integer;
    IF v_qtd NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
    SELECT p.nome, p.preco INTO v_nome_produto, v_preco
      FROM public.mf64_produtos p
     WHERE p.id = v_id AND p.user_id = v_user AND p.ativo = true
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Um produto saiu do catálogo. Atualize seu carrinho.'; END IF;
    v_total := v_total + (v_preco * v_qtd);
    IF v_total > 100000 THEN RAISE EXCEPTION 'Valor excede o limite de compra online. Contate a loja.'; END IF;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'descricao', v_nome_produto, 'quantidade', v_qtd, 'valor_unitario', v_preco));
  END LOOP;

  SELECT id INTO v_cliente FROM public.clientes
   WHERE user_id = v_user AND telefone = v_telefone
     AND pg_catalog.lower(btrim(nome)) = pg_catalog.lower(v_nome)
   LIMIT 1;
  IF v_cliente IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, email)
    VALUES (v_user, v_nome, v_telefone, v_email)
    RETURNING id INTO v_cliente;
  END IF;

  INSERT INTO public.pedidos
    (user_id, cliente_id, descricao, data_pedido, valor, status, observacoes, itens)
  VALUES
    (v_user, v_cliente,
     CASE WHEN jsonb_array_length(v_itens) = 1 THEN v_itens->0->>'descricao'
          ELSE left(v_itens->0->>'descricao' || ' (+' || (jsonb_array_length(v_itens)-1)::text || ' itens)', 250) END,
     current_date, v_total, 'Pendente',
     left('LOJA ONLINE — Pagamento a confirmar pelo WhatsApp. ' || v_obs, 5000),
     v_itens)
  RETURNING id INTO v_pedido;

  INSERT INTO public.mf64_checkout_ids(id, user_id, pedido_id, telefone)
  VALUES (p_solicitacao, v_user, v_pedido, v_telefone);
  RETURN jsonb_build_object('pedido_id', v_pedido, 'total', v_total,
     'whatsapp', v_whatsapp, 'repetido', false);
END;
$body$;

-- Uma função pública simples chama o processo em schema NÃO exposto.
-- SECURITY INVOKER + grants explícitos; a função interna é a única com privilégios elevados.
CREATE OR REPLACE FUNCTION public.mf64_enviar_pedido(
  p_nome text, p_telefone text, p_email text, p_observacoes text,
  p_itens jsonb, p_solicitacao uuid, p_verificacao text DEFAULT ''
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT mf64_private.finalizar_pedido(p_nome, p_telefone, p_email,
                                       p_observacoes, p_itens, p_solicitacao, p_verificacao);
$fn$;

REVOKE ALL ON FUNCTION public.mf64_enviar_pedido(text,text,text,text,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mf64_private.finalizar_pedido(text,text,text,text,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mf64_private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mf64_enviar_pedido(text,text,text,text,jsonb,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mf64_private.finalizar_pedido(text,text,text,text,jsonb,uuid,text) TO anon, authenticated;

COMMIT;

-- Verificação não modifica dados: responsável da loja e segurança.
SELECT c.slug, (SELECT u.email FROM auth.users u WHERE u.id = c.user_id) AS conta_gestora,
       c.ativa, (SELECT count(*) FROM public.mf64_produtos) AS produtos,
       (SELECT relrowsecurity FROM pg_class WHERE oid='public.mf64_produtos'::regclass) AS rls_ativo,
       has_table_privilege('anon','public.clientes','SELECT') AS anon_le_clientes,
       has_table_privilege('anon','public.pedidos','SELECT') AS anon_le_pedidos
FROM public.mf64_loja_config c;
