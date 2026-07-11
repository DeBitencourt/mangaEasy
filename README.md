# MangaEasy 📚

MangaEasy é um aplicativo móvel universal construído em **React Native** com **Expo** (SDK 56), projetado para buscar, baixar e ler capítulos de mangás, manhwas e novels offline no estilo Webtoon. O aplicativo possui uma identidade visual moderna e premium com tema de cores roxas/violetas.

---

## ✨ Funcionalidades Principais

### 🔍 1. Busca Ativa & Fontes Dinâmicas
*   **Fontes Suportadas**: Suporta raspagem e leitura direta das fontes `mangaread.org` (Mangás/Manhwas) e `novelbuddy.com` (Light Novels).
*   **Alternador de Fontes**: Troca rápida de fonte de conteúdo no cabeçalho.
*   **Carregamento de Novels Completo**: NovelBuddy utiliza uma integração direta com sua API JSON oficial (`/titles/${novelId}/chapters`), permitindo carregar de forma instantânea listas gigantescas com mais de 2.500 capítulos.
*   **Modo Simulação**: Desenvolvimento simplificado no ambiente Web com dados locais mockados de títulos famosos como *Solo Leveling*, *One Piece* e *The Beginning After the End*.

### 📖 2. Modal de Detalhes Avançado
*   **Seletor de Tipo Manual**: Força o processamento de imagens no formato tradicional ou vertical (Webtoon), adaptando-se a mangás e manhwas independente da fonte.
*   **Ferramentas de Seleção de Capítulos**:
    *   Seleção em massa ("Todos" ou "Nenhum").
    *   Seleção por **Intervalo Numérico** (ex: capítulos do 10 ao 50) para downloads rápidos.
    *   Ordenação rápida (Crescente/Decrescente) e filtro de busca por nome de capítulo.

### ⚡ 3. Super Downloader Concorrente (5x mais Rápido)
*   **Fila Concorrente**: Utiliza um pool de **5 trabalhadores paralelos** (`Promise.all` em lote sobre `FileSystem.downloadAsync`) para puxar imagens simultaneamente. Isso reduz o tempo de download de um capítulo padrão (50 páginas) de 50 segundos para cerca de 8 a 10 segundos.
*   **Controle Total**: Pausa, retoma e cancela downloads a qualquer momento mantendo a integridade dos arquivos locais.
*   **Console de Logs Integrado**: Terminal expansível em tempo real que exibe os caminhos de rede e processos de gravação no disco, facilitando a depuração.

### 🗄️ 4. Biblioteca Offline Personalizável
*   **Tags de Filtro**: Organização por categorias (`Todos`, `Mangás`, `Novels`) com um clique.
*   **Favoritos no Topo**: Títulos marcados como favoritos sobem automaticamente para o início da lista.
*   **Grid Interativo com Drag-and-Drop**: Longo clique (300ms) entra em modo de edição, permitindo arrastar os cards na tela e reordenar a grade manualmente. A nova ordem é salva e persistida localmente.

### ☁️ 5. Backup em Nuvem Anônimo (Supabase)
*   **Código de Backup**: Cada dispositivo possui um código UUID único.
*   **Sincronização**: Envia histórico, favoritos, lista "A Ler" e progresso de leitura para a nuvem de forma silenciosa e anônima.
*   **Restauração**: Digite o código de backup de qualquer outro dispositivo para baixar os dados na nuvem e atualizar sua biblioteca local instantaneamente.

### 📖 6. Leitor Contínuo de Alta Performance (60 FPS)
*   **Leitor Vertical Virtualizado**: Unifica os modos "página" e "webtoon" em um único `<FlatList>` extremamente performático.
*   **Economia de Memória GPU**: Configurado com `removeClippedSubviews` e renderização de janelas inteligentes (`windowSize={5}`) para desmontar imagens fora da tela, eliminando stutters em manhwas longos.
*   **Cache de Proporções**: Grava o aspect ratio de cada página após o primeiro carregamento, evitando saltos de layout e tremulações ao rolar o leitor.
*   **Leitor de Novels**: Renderização fluida de texto formatado com velocidade de rolagem nativa a 60 FPS.

---

## 🛠️ Arquitetura e Tecnologias

*   **Core**: React Native & Expo SDK 56.
*   **Navegação**: Roteamento dinâmico baseado em arquivos com `expo-router`.
*   **Banco de Dados Local**: Armazenamento relacional ultra-rápido usando `expo-sqlite`.
*   **Armazenamento de Arquivos**: Manipulação nativa de diretórios com `expo-file-system/legacy`.
*   **Processamento de Imagens**: Script `generate-adaptive-icon.js` que utiliza Jimp para gerar ícones nativos adaptativos redimensionados para a zona segura (safe-zone), evitando cortes no launcher do Android.
*   **Otimização MangaDex CDN**: Utilização da query `?forcePort443=true` nas chamadas @Home para evitar servidores lentos e forçar CDN padrão do MangaDex, além de salvar imagens no formato leve `dataSaver`.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
*   Node.js instalado (v18 ou superior recomendado).
*   NPM configurado.

### Execução

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o Metro Bundler:**
   ```bash
   npx expo start
   ```

3. **Comandos rápidos de compilação:**
   *   **Android:** `npm run android`
   *   **iOS:** `npm run ios`
   *   **Web (Simulador):** `npm run web`

---

## 📂 Estrutura do Código Principal

*   `src/app/index.tsx`: Tela de busca principal, grid de resultados, filtros e modal de detalhes.
*   `src/app/downloads.tsx`: Fila de downloads ativos, painel de estatísticas e console de logs.
*   `src/app/explore.tsx`: Biblioteca offline do usuário (reordenação por arrasto, filtros e favoritos) e inicialização dos leitores.
*   `src/components/manga-reader-modal.tsx`: Leitor local offline virtualizado.
*   `src/components/online-reader-modal.tsx`: Leitor online virtualizado para pré-visualização.
*   `src/context/manga-context.tsx`: Estado central do aplicativo (lógica de fila paralela de download e logs).
*   `src/utils/supabase.ts`: Comunicação anônima de backup e sincronização de dados.
*   `src/utils/database.ts`: Operações CRUD e inicialização de tabelas do SQLite.
*   `src/utils/scraper.ts`: Lógica de extração de metadados das páginas HTML e integração com a API NovelBuddy.
