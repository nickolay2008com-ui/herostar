const birthDateInput = document.querySelector('input[name="date"]');

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

if (birthDateInput) {
  birthDateInput.max = localIsoDate();
  birthDateInput.addEventListener('input', () => {
    birthDateInput.setCustomValidity(
      birthDateInput.value && birthDateInput.value > birthDateInput.max
        ? 'Дата рождения не может быть в будущем.'
        : '',
    );
  });
}
