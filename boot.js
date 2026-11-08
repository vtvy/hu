const $ = s => document.querySelector(s);
window.$ = $;
bootHu().catch(err => {
  console.error(err);
  const toast = document.querySelector('#toast');
  if (toast) {
    toast.textContent = 'Không khởi động được Hũ. Thử tải lại trang.';
    toast.style.display = 'block';
  }
});
