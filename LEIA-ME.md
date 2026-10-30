# Mini Forge 64 — Portal do cliente (todos os pedidos)

Esta atualização é **adicional** ao Gestor de Pedidos existente. Não substitui `app.js`, `styles.css`, `config.js`, nem o banco de dados atual.

## O que entrega

- **Um link privado por cliente**: todos os pedidos antigos, atuais e futuros do mesmo cadastro aparecem na mesma página.
- Lista por data decrescente, com descrição, quantidades e situação (`Pendente`, `Em andamento`, `Concluído`, `Cancelado`).
- Área administrativa **`acessos.html`**: pesquisa de clientes, contagem de pedidos, copiar link, enviar por WhatsApp e revogar/renovar o acesso.
- Área do cliente **`acompanhar.html`**: não exige login, consulta somente pelo código secreto; não exibe valores, e-mail, telefone ou observações internas.
- SQL compatível com **pedidos simples (v1)** e com **vários itens (v2)**.

## Instalação — siga esta ordem

### 1. Backups

No Gestor de Pedidos, exporte um backup dos cadastros antes de alterar o banco. Guarde uma cópia privada. Se houver muitas alterações, faça também um backup do banco pelo serviço de hospedagem.

### 2. Supabase

No **mesmo** projeto Supabase do Gestor de Pedidos, abra **SQL Editor → New query**. Cole o conteúdo completo de **`ATUALIZACAO_PORTAL_CLIENTE.sql`** e clique em **Run**.

No fim, a consulta deve mostrar:

| rls_clientes | rls_pedidos | anon_le_clientes | anon_pode_consultar_portal |
|---|---|---|---|
| true | true | false | true |

Não execute `supabase.sql` novamente e **não** desative o RLS. O SQL acrescenta o campo `codigo_portal` à tabela de clientes e uma função restrita de consulta por código secreto; os registros existentes são preservados.

### 3. GitHub

Acesse o repositório `gestor-pedidos` e envie **diretamente para a raiz** estes arquivos:

- `acessos.html`
- `acessos.js`
- `acompanhar.html`
- `acompanhar.js`
- `portal.css`
- `index.html` — **opcional**, adiciona apenas o link `Portal dos clientes` no menu lateral. Se seu `index.html` foi personalizado desde a primeira versão, não o sobrescreva; basta abrir `acessos.html` diretamente ou inserir o mesmo link no menu.

**Não** envie nem substitua `config.js`, `app.js`, `styles.css` ou `supabase.sql`. O arquivo SQL desta atualização deve ser executado no Supabase, não precisa ficar publicado no GitHub.

Clique em **Commit changes** e aguarde o workflow `pages build and deployment` ficar verde.

### 4. Administrador

Acesse:

`https://lincolncavallcante-ux.github.io/gestor-pedidos/acessos.html`

Entre com o e-mail/senha do gestor, se necessário. Busque um cliente e clique em `Copiar link` ou `Enviar pelo WhatsApp`.

### 5. Cliente

O cliente recebe uma URL semelhante a:

`https://lincolncavallcante-ux.github.io/gestor-pedidos/acompanhar.html#chave=00000000-0000-4000-8000-000000000000`

**Esse código é apenas ilustrativo.** Nunca envie o exemplo: use o link gerado na página `acessos.html`.

Ao abrir o link, o cliente vê todos os pedidos desse cadastro, ordenados do mais recente ao mais antigo. Se você criar outro pedido para o mesmo cliente, o novo pedido aparecerá ao atualizar a página.

### 6. Teste de segurança

1. No computador: crie dois clientes de teste A e B, com dois pedidos para A e um para B.
2. Abra o link de A em janela anônima: devem aparecer só os dois pedidos de A.
3. Abra o link de B: deve aparecer só o pedido de B.
4. No painel `acessos.html`, use `Revogar link` para A; abra o link antigo: deve informar que ele não existe/revogado.
5. Abra o link novo de A: deve funcionar.
6. No Supabase, confirme que as tabelas continuam com RLS ativo e que `anon` não possui `SELECT` direto.

## Atenção à privacidade

**O link é a credencial.** Qualquer pessoa que o receba pode visualizar o histórico atual e futuro desse cliente, até a revogação. Não envie links em grupos, não publique em redes sociais e não deixe códigos em capturas de tela. Em caso de vazamento, clique em `Revogar link` e envie o novo ao verdadeiro cliente. Para exigências de segurança maiores, o ideal é adicionar autenticação com código temporário (OTP) e limites de requisição.

O código do cliente fica no **fragmento** da URL (`#chave=`), que não é enviado ao servidor web pela requisição de carregamento da página. Isso reduz exposição casual em logs do GitHub Pages; não elimina o risco de alguém compartilhar ou copiar o link.

A função pública do Supabase é deliberadamente `SECURITY DEFINER`, mas com escopo restrito ao cliente identificado por UUID aleatório; retorna somente primeiro nome e informações resumidas dos pedidos. Nenhuma tabela tem acesso anônimo direto. Antes de uso extensivo em produção, considere auditoria de segurança externa e rate limiting no backend.

## Compatibilidade

- O sistema está preparado para a versão atual do banco com `clientes` e `pedidos` e as políticas RLS já configuradas.
- Se a atualização **múltiplos itens v2** foi executada no banco, cada pedido exibe sua lista de itens e quantidades.
- Se o banco ainda está em **v1**, a página mostra a descrição única de cada pedido. O portal não cria a coluna `itens` automaticamente.
- O portal exibe até **500 pedidos mais recentes por cliente**. Para um volume maior, implemente paginação antes de ultrapassar o limite.
- A página principal da loja `miniforge64.com.br` ainda não faz parte desta atualização; apenas o gestor e o portal no GitHub Pages.
- Se um mesmo consumidor foi cadastrado como dois registros de cliente separados, cada registro terá um link distinto. Para consolidar os pedidos, será necessário associá-los a um cadastro único de cliente.

## Arquivos

| Arquivo | Função |
|---|---|
| `ATUALIZACAO_PORTAL_CLIENTE.sql` | Migração e consulta pública segura |
| `acessos.html` + `acessos.js` | Gerenciar links, com login administrativo |
| `acompanhar.html` + `acompanhar.js` | Tela do cliente com todos os pedidos |
| `portal.css` | Identidade Mini Forge 64, responsiva |
| `index.html` | Menu atualizado opcional |

Não alteramos as configurações ou chaves do Supabase no GitHub.
