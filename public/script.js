document.addEventListener('DOMContentLoaded', function() {
  const chatBox = document.getElementById('chatBox');
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  
  let userName = '';
  let conversationState = 'awaitingName'; // Estados: awaitingName, awaitingRequest, processing
  
  // Função para adicionar mensagem ao chat
  function addMessage(sender, message, isMovie = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `${sender}-message`;
    
    const avatar = document.createElement('img');
    avatar.className = `${sender}-avatar`;
    avatar.src = sender === 'bot' 
      ? 'https://via.placeholder.com/40/032541/FFFFFF?text=BOT' 
      : 'https://via.placeholder.com/40/01b4e4/FFFFFF?text=YOU';
    avatar.alt = sender === 'bot' ? 'Bot' : 'Você';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (isMovie && Array.isArray(message)) {
      // Se for uma lista de filmes
      message.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.className = 'movie-card clearfix';
        
        const title = document.createElement('h3');
        title.textContent = `${movie.title} (${movie.release_date.slice(0, 4)})`;
        
        const rating = document.createElement('p');
        rating.textContent = `⭐ Avaliação: ${movie.vote_average}/10`;
        
        const overview = document.createElement('p');
        overview.textContent = movie.overview || 'Sinopse não disponível';
        
        if (movie.poster_path) {
          const poster = document.createElement('img');
          poster.src = `https://image.tmdb.org/t/p/w200${movie.poster_path}`;
          poster.alt = `Poster de ${movie.title}`;
          movieCard.appendChild(poster);
        }
        
        movieCard.appendChild(title);
        movieCard.appendChild(rating);
        movieCard.appendChild(overview);
        content.appendChild(movieCard);
      });
    } else {
      // Mensagem normal
      content.textContent = message;
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatBox.appendChild(messageDiv);
    
    // Rolagem automática para a última mensagem
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  
  // Função para enviar mensagem
  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    
    // Adiciona mensagem do usuário
    addMessage('user', message);
    userInput.value = '';
    
    // Processa de acordo com o estado da conversa
    if (conversationState === 'awaitingName') {
      userName = message;
      conversationState = 'awaitingRequest';
      addMessage('bot', `Prazer, ${userName}! Me diga que tipo de filme você está procurando. Por exemplo: "Filmes de ação com o Tom Cruise" ou "Recomendações similares a Interestelar"`);
    } else if (conversationState === 'awaitingRequest') {
      conversationState = 'processing';
      addMessage('bot', 'Estou pensando nas melhores recomendações para você...');
      
      // Envia para o servidor
      fetch('/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName: userName,
          userInput: message
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          addMessage('bot', `Desculpe, ocorreu um erro: ${data.error}`);
        } else {
          addMessage('bot', data.response);
          if (data.movies && data.movies.length > 0) {
            addMessage('bot', data.movies, true);
          }
          addMessage('bot', 'Posso te ajudar com mais alguma recomendação?');
        }
        conversationState = 'awaitingRequest';
      })
      .catch(error => {
        console.error('Error:', error);
        addMessage('bot', 'Desculpe, ocorreu um erro ao processar sua solicitação.');
        conversationState = 'awaitingRequest';
      });
    }
  }
  
  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Mensagem inicial
  addMessage('bot', 'Olá! Eu sou o BOT Movies. Qual é o seu nome?');
});