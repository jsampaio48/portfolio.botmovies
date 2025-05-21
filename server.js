require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado da conversa por usuário
const userSessions = {};

// Menu principal
const MAIN_MENU = `
Por favor, escolha uma opção de pesquisa:
1. Pesquisar por Gênero
2. Pesquisar por Diretor
3. Pesquisar por Ator
4. Pesquisar por Ano de Lançamento
5. Pesquisar por Popularidade
6. Sair

Digite o número da opção desejada:`;

// Mapeamento de gêneros
let genreMap = {};

// Inicializa o mapeamento de gêneros
async function initializeGenreMap() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
      params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
    });
    
    genreMap = response.data.genres.reduce((map, genre) => {
      map[genre.id] = genre.name;
      return map;
    }, {});
    
  } catch (error) {
    console.error('Erro ao carregar gêneros:', error);
  }
}

// Função para pesquisar filmes
async function searchMovies(option, query) {
  try {
    let params = { 
      api_key: TMDB_API_KEY,
      language: 'pt-BR',
      page: 1,
      sort_by: 'popularity.desc'
    };

    switch(option) {
      case '1': // Gênero
        const genre = Object.entries(genreMap)
          .find(([_, name]) => name.toLowerCase().includes(query.toLowerCase()));
        if (genre) params.with_genres = genre[0];
        break;
      case '2': // Diretor
        return await searchByPerson(query, 'director');
      case '3': // Ator
        return await searchByPerson(query, 'cast');
      case '4': // Ano
        params.primary_release_year = query;
        break;
      case '5': // Popularidade
        params.sort_by = 'popularity.desc';
        break;
    }

    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, { params });
    return await enrichMoviesData(response.data.results.slice(0, 5));

  } catch (error) {
    console.error('Erro na pesquisa:', error);
    return [];
  }
}

// Pesquisa por pessoa (diretor/ator)
async function searchByPerson(query, job) {
  try {
    // Primeiro busca a pessoa
    const personResponse = await axios.get(`${TMDB_BASE_URL}/search/person`, {
      params: { 
        api_key: TMDB_API_KEY,
        query: query,
        language: 'pt-BR'
      }
    });

    if (personResponse.data.results.length === 0) return [];

    const personId = personResponse.data.results[0].id;

    // Depois busca os filmes da pessoa
    const moviesResponse = await axios.get(`${TMDB_BASE_URL}/person/${personId}/movie_credits`, {
      params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
    });

    const movies = job === 'director' 
      ? moviesResponse.data.crew.filter(m => m.job === 'Director')
      : moviesResponse.data.cast;

    return await enrichMoviesData(movies
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 5));

  } catch (error) {
    console.error('Erro na pesquisa por pessoa:', error);
    return [];
  }
}

// Enriquece os dados dos filmes
async function enrichMoviesData(movies) {
  return Promise.all(movies.map(async movie => {
    try {
      // Busca créditos para pegar o diretor e elenco
      const creditsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movie.id}/credits`, {
        params: { api_key: TMDB_API_KEY }
      });

      const directors = creditsResponse.data.crew
        .filter(person => person.job === 'Director')
        .map(person => person.name);

      const cast = creditsResponse.data.cast
        .slice(0, 10)
        .map(person => person.name);

      // Busca detalhes para pegar o ranking
      const detailsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movie.id}`, {
        params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
      });

      return {
        title: movie.title,
        director: directors.join(', ') || 'Desconhecido',
        cast: cast.join(', '),
        genres: movie.genre_ids?.map(id => genreMap[id]).filter(Boolean).join(', ') || 'Desconhecido',
        year: movie.release_date?.substring(0, 4) || 'Desconhecido',
        ranking: detailsResponse.data.popularity?.toFixed(1) || 'N/A'
      };

    } catch (error) {
      console.error('Erro ao enriquecer dados do filme:', movie.id, error);
      return {
        title: movie.title,
        director: 'Erro ao carregar',
        cast: 'Erro ao carregar',
        genres: 'Erro ao carregar',
        year: 'Erro ao carregar',
        ranking: 'N/A'
      };
    }
  }));
}

// Formata os resultados
function formatResults(movies) {
  if (movies.length === 0) return 'Nenhum filme encontrado com esses critérios.';

  return movies.map(movie => `
🎬 *${movie.title}* (${movie.year})
📌 *Gênero(s):* ${movie.genres}
🎥 *Diretor(es):* ${movie.director}
👥 *Elenco:* ${movie.cast}
⭐ *Popularidade:* ${movie.ranking}\n`).join('\n');
}

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota de interação
app.post('/interact', async (req, res) => {
  const { userId, userInput } = req.body;

  try {
    // Inicializa a sessão se não existir
    if (!userSessions[userId]) {
      userSessions[userId] = {
        name: userInput,
        waitingForOption: true
      };
      return res.json({ response: MAIN_MENU });
    }

    const session = userSessions[userId];

    // Processa a opção do menu
    if (session.waitingForOption) {
      if (userInput === '6') { // Sair
        delete userSessions[userId];
        return res.json({ 
          response: `Obrigado por usar nosso serviço, ${session.name}! Volte sempre.`,
          endConversation: true
        });
      }

      if (!['1','2','3','4','5'].includes(userInput)) {
        return res.json({ 
          response: 'Opção inválida. Por favor, escolha um número de 1 a 6.\n' + MAIN_MENU 
        });
      }

      session.currentOption = userInput;
      session.waitingForOption = false;
      
      const optionPrompts = {
        '1': 'Digite o gênero que deseja pesquisar (ex: Ação, Comédia):',
        '2': 'Digite o nome do diretor:',
        '3': 'Digite o nome do ator/atriz:',
        '4': 'Digite o ano de lançamento (ex: 2020):',
        '5': 'Buscando filmes mais populares...'
      };

      return res.json({ 
        response: optionPrompts[userInput],
        skipUserInput: userInput === '5' // Pula entrada do usuário para popularidade
      });

    } else {
      // Processa a pesquisa
      const movies = await searchMovies(session.currentOption, userInput);
      session.waitingForOption = true;

      return res.json({
        response: formatResults(movies) + 
          '\n\nComo posso te ajudar mais?\n' + MAIN_MENU
      });
    }

  } catch (error) {
    console.error('Erro na interação:', error);
    return res.status(500).json({ 
      response: 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.\n' + MAIN_MENU
    });
  }
});

// Inicia o servidor
app.listen(port, async () => {
  await initializeGenreMap();
  console.log(`Servidor rodando em http://localhost:${port}`);
});