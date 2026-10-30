# Gestor de Pedidos

Site estático em português para cadastrar clientes e vincular vários pedidos a cada cliente. Permite editar, excluir, buscar, filtrar por status e cliente, ordenar por data e exportar CSV.

## Usar agora (sem configurar nada)

1. Baixe o ZIP e extraia todos os arquivos em uma pasta.
2. Abra `index.html` no navegador (Chrome, Firefox ou Edge).
3. Clique em **Clientes** > **Novo cliente**. Depois em **Pedidos** > **Novo pedido**.
4. Os dados são salvos **no armazenamento deste navegador**, não no GitHub. Se você limpar os dados do navegador ou trocar de dispositivo, poderá perder os registros.
5. Use **Exportar backup** regularmente (arquivo JSON); **Restaurar backup** recupera registros locais. O botão **Exportar CSV** cria uma planilha para abrir no Excel.

**Importante:** mantenha backups em local seguro. O modo local não é adequado como armazenamento único para informações importantes.

## Publicar gratuitamente no GitHub Pages

1. Crie uma conta no https://github.com, se ainda não tiver.
2. Crie um repositório (ex.: `gestor-pedidos`). Para facilitar, use um repositório público, mas **não inclua dados de clientes** no repositório.
3. Envie os arquivos `index.html`, `styles.css`, `app.js` e `config.js` para a raiz do repositório (pode incluir README e SQL também).
4. Abra **Settings > Pages** e, em **Build and deployment**, escolha **Deploy from a branch**, branch `main`, pasta `/(root)`, **Save**.
5. Acesse a URL indicada pelo GitHub Pages, geralmente `https://SEU-USUARIO.github.io/gestor-pedidos/`.

O GitHub Pages hospeda o código do site. Ele **não oferece um banco de dados de pedidos**, então o modo local continua sendo específico de cada navegador/dispositivo.

## Ativar banco online no Supabase

1. Crie um projeto em https://supabase.com/.
2. Entre em **SQL Editor**, cole o conteúdo de `supabase.sql` e execute.
3. Em **Authentication**, configure login por e-mail. Para uma equipe pequena, recomenda-se **desabilitar cadastro público** depois de criar os usuários autorizados, ou criar/convidar usuários pelo painel (dependendo das opções do seu plano). Confirme seu endereço de e-mail se solicitado.
4. Encontre a **Project URL** e a chave **anon/publishable** em **Project Settings > API** (os nomes exatos no painel podem mudar).
5. Edite `config.js`:

   ```js
   window.APP_CONFIG = {
     supabaseUrl: 'https://SEU-PROJETO.supabase.co',
     supabaseAnonKey: 'SUA-CHAVE-PUBLICA'
   };
   ```

6. **Nunca coloque uma chave `service_role` ou qualquer chave secreta no `config.js`**, porque ele é público.
7. Atualize o arquivo no GitHub e abra seu site. Clique em **Configurar nuvem** > **Usar nuvem**. Entre com e-mail e senha ou crie a conta, se cadastro estiver habilitado.

A proteção do banco usa **Row Level Security (RLS)**, de modo que cada usuário veja apenas seus registros. Se funcionários diferentes devem acessar **os mesmos** clientes/pedidos, será necessária uma estrutura de equipes/permissões, não implementada nesta versão.

### Alternando entre local e online

Os dados locais **não são enviados automaticamente** ao Supabase. Os dois ambientes são separados. O backup JSON permite restauração **somente no modo local**, nesta versão. Para migrar registros locais já cadastrados para a nuvem, será necessário importar os dados separadamente com procedimento adequado.

## Limitações e cuidados

- Esta é uma primeira versão (MVP) de controle simples; não inclui emissão de notas, estoque, integração com WhatsApp ou múltiplos itens por pedido.
- O campo valor representa o valor total do pedido. A visão geral soma valores dos pedidos não cancelados.
- Não cadastre dados pessoais sensíveis sem avaliar a segurança, controle de acesso, política de privacidade e obrigações aplicáveis da LGPD.
- GitHub Pages é um site **público**. Não faça commit de arquivos JSON ou CSV contendo dados reais de clientes.
- Disponibilidade do plano gratuito do Supabase e políticas do GitHub podem mudar.

## Arquivos

- `index.html`: interface
- `styles.css`: estilos
- `app.js`: cadastros, filtros, armazenamento e autenticação
- `config.js`: configuração opcional da nuvem
- `supabase.sql`: tabelas e regras de segurança do banco
