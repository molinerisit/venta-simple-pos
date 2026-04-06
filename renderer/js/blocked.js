// Este script se enlazaría desde blocked.html con <script src="../js/blocked.js" defer></script>
document.addEventListener('DOMContentLoaded', () => {
  const messageElement = document.getElementById('block-message');
  window.electronAPI.onBlockMessage((message) => {
    messageElement.textContent = message;
  });
});