const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const navItems = document.querySelectorAll(".nav-links a");
const form = document.querySelector("#reservation");
const formMessage = document.querySelector("#formMessage");
const faqItems = document.querySelectorAll(".faq-item");
const revealElements = document.querySelectorAll(".reveal");

document.querySelector("#year").textContent = new Date().getFullYear();

menuToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("active");
  menuToggle.setAttribute("aria-expanded", isOpen);
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navLinks.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.querySelector("#name").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  const email = document.querySelector("#email").value.trim();
  const guests = document.querySelector("#guests").value.trim();

  if (!name || !phone || !email || !guests) {
    formMessage.textContent = "Please complete all required fields.";
    formMessage.style.color = "#ffb347";
    return;
  }

  if (!email.includes("@") || !email.includes(".")) {
    formMessage.textContent = "Please enter a valid email address.";
    formMessage.style.color = "#ffb347";
    return;
  }

  if (Number(guests) < 1) {
    formMessage.textContent = "Please enter at least 1 guest.";
    formMessage.style.color = "#ffb347";
    return;
  }

  formMessage.textContent = "Thank you! Your reservation request has been received.";
  formMessage.style.color = "#7dff9b";
  form.reset();
});

faqItems.forEach((item) => {
  const button = item.querySelector(".faq-question");

  button.addEventListener("click", () => {
    item.classList.toggle("active");
  });
});

const revealOnScroll = () => {
  revealElements.forEach((element) => {
    const elementTop = element.getBoundingClientRect().top;
    const windowHeight = window.innerHeight;

    if (elementTop < windowHeight - 80) {
      element.classList.add("visible");
    }
  });
};

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("load", revealOnScroll);