# MangaEasy 📚

MangaEasy é um aplicativo móvel universal construído em **React Native** com **Expo** (SDK 56), projetado para buscar, baixar e ler capítulos de mangá offline no estilo Webtoon. O aplicativo possui uma identidade visual moderna e premium com tema de cores roxas/violetas.

---

## ✨ Funcionalidades

### 🔍 1. Busca Ativa por Título
- Digite o título do mangá e obtenha os resultados em formato de cards organizados em um grid responsivo de 2 colunas.
### Seletor de Tipo Manual (Manga, Manhwa e Manhua)
- Um seletor dropdown localizado logo abaixo da *Source* nos detalhes do mangá.
- Permite que você defina manualmente como a imagem será baixada e processada (forçando a renderização em formato tradicional ou Webtoon/rolagem vertical como Manhwa e Manhua), independente do que for coletado originalmente no scraping.

###  Seletor de fonte dropdown no canto superior direito para alternar dinamicamente entre as fontes suportadas (`mangaread.org` e `asuracomics.net`).
- Modo de simulação para desenvolvimento Web com dados mockados de títulos populares como *Solo Leveling*, *The Beginning After the End* e *One Piece*.

### 📖 2. Modal de Detalhes e Seleção de Capítulos
- Visualização completa da imagem de capa, título e sinopse do mangá.
- Lista rolável interna com todos os capítulos disponíveis na fonte.
- **Ferramentas Avançadas de Seleção**:
  - Seleção em massa ("Todos" ou "Nenhum").
  - Seleção por **Intervalo Numérico** (ex: selecionar do capítulo 1 ao 20 com um clique).
  - Barra de busca interna para filtrar capítulos específicos.
  - Ordenação dinâmica por ordem **Crescente** ou **Decrescente**.

### ⚡ 3. Aba de Downloads Ativos
- Gerenciamento e acompanhamento em tempo real do progresso de downloads ativos.
- Estatísticas de download: progresso total em porcentagem, progresso da página atual, velocidade de download em tempo real e tempo restante estimado (ETA).
- Controles de download: Pausar, Retomar e Cancelar.
- **Console de Logs Integrado**: Um terminal recolhível que exibe logs detalhados e em tempo real sobre o status de cada página baixada para fácil depuração.

### 🗄️ 4. Biblioteca Offline
- Exibe o histórico de downloads concluídos.
- Gerenciamento limpo e focado no conteúdo offline do usuário.
- Botão "Limpar Histórico" para gerenciar o espaço ocupado.

### 📖 5. Leitor estilo Webtoon
- Leitor vertical em tela cheia com rolagem contínua das páginas salvas localmente.
- Indicador visual da página atual (`Pág. X / Y`).
- Navegação rápida no cabeçalho do leitor para ir ao capítulo anterior ou posterior.
- Menu dropdown integrado para trocar de capítulo rapidamente sem sair da tela de leitura.

---

## 🛠️ Arquitetura e Tecnologia

- **Core**: React Native & Expo SDK 56.
- **Roteamento**: `expo-router` com navegação nativa baseada em arquivos (`app-tabs` do Expo Router).
- **Raspagem de Dados (Scraper)**: Realizada de forma nativa no dispositivo via `node-html-parser` fazendo requisições de rede diretas (ignorando bloqueios de CORS que ocorrem no navegador).
- **Gerenciamento de Arquivos**: Utiliza a API `expo-file-system/legacy` para criar diretórios locais seguros e baixar as imagens sequencialmente em alta velocidade na pasta privada do app (`FileSystem.documentDirectory`).
- **Animações e Splash Screen**: Implementado com `react-native-reanimated` e `react-native-worklets` usando um tema degradê roxo.
- **Tema Visual**: Estilos customizados e flexíveis usando uma paleta violeta/roxa premium (`#8B5CF6`, `#A855F7`, `#7C3AED`).

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
Certifique-se de possuir o Node.js e o NPM instalados em sua máquina.

### Passos para Inicializar

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o servidor de desenvolvimento do Metro Bundler:**
   ```bash
   npx expo start
   ```

3. **Opções para executar o aplicativo:**
   - **Android Emulator / Dispositivo:** Pressione `a` no terminal ou execute:
     ```bash
     npm run android
     ```
   - **iOS Simulator / Dispositivo:** Pressione `i` no terminal ou execute:
     ```bash
     npm run ios
     ```
   - **Navegador Web (Modo Simulação):** Pressione `w` no terminal ou execute:
     ```bash
     npm run web
     ```

---

## 📂 Estrutura do Código Principal

- `src/app/index.tsx`: Tela de busca ("Baixar"), grid de mangás e modal de detalhes/seleção de capítulos.
- `src/app/downloads.tsx`: Tela de controle e listagem de downloads em andamento.
- `src/app/explore.tsx`: Tela da Biblioteca offline e o leitor vertical de mangás (Webtoon).
- `src/context/manga-context.tsx`: Estado global do aplicativo, persistência do histórico em arquivo JSON local e lógica de controle de downloads nativo e simulado.
- `src/utils/scraper.ts`: Lógica de busca e raspagem das páginas HTML dos sites de mangá.
- `src/components/animated-icon.tsx`: Componente de Splash screen e transições animadas personalizadas.
