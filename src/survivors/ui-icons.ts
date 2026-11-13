export function moodIcon() {
  const mood = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mood.classList.add('survivor-guide-mood');
  mood.setAttribute('viewBox', '0 0 24 24');
  mood.setAttribute('aria-hidden', 'true');
  mood.innerHTML = '<circle cx="12" cy="12" r="11" fill="#ffd66b"/><circle cx="8" cy="9" r="1.5" fill="#49304e"/><circle cx="16" cy="9" r="1.5" fill="#49304e"/><path d="M7 14c1 5 9 5 10 0" fill="none" stroke="#49304e" stroke-width="2" stroke-linecap="round"/>';
  return mood;
}
