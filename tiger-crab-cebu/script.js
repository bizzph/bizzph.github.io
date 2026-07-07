const menuToggle = document.querySelector(".menu-toggle");
const navMenu = document.querySelector(".nav-menu");

menuToggle.addEventListener("click", () => {
  navMenu.classList.toggle("active");
});

document.querySelectorAll(".nav-menu a").forEach(link => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("active");
  });
});

const fadeElements = document.querySelectorAll(".fade-in");

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
    }
  });
}, {
  threshold: 0.15
});

fadeElements.forEach(element => observer.observe(element));

document.querySelectorAll(".faq-item button").forEach(button => {
  button.addEventListener("click", () => {
    button.parentElement.classList.toggle("active");
  });
});

const form = document.getElementById("reservationForm");
const formMessage = document.getElementById("formMessage");

form.addEventListener("submit", event => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const date = document.getElementById("date").value;
  const guests = document.getElementById("guests").value;

  if (!name || !phone || !date || !guests) {
    formMessage.textContent = "Please complete all required reservation fields.";
    formMessage.style.color = "#d00000";
    return;
  }

  if (guests < 1) {
    formMessage.textContent = "Please enter a valid number of guests.";
    formMessage.style.color = "#d00000";
    return;
  }

  formMessage.textContent = "Thank you! Your reservation request has been received.";
  formMessage.style.color = "#0077b6";
  form.reset();
});