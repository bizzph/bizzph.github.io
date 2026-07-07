const menuToggle = document.getElementById("menuToggle");
const navMenu = document.getElementById("navMenu");
const navLinks = document.querySelectorAll(".nav-link");
const faqItems = document.querySelectorAll(".faq-item");
const reservationForm = document.getElementById("reservationForm");
const formMessage = document.getElementById("formMessage");
const backToTop = document.getElementById("backToTop");
const revealElements = document.querySelectorAll(".reveal");
const sections = document.querySelectorAll("section[id]");

/* Mobile menu */
menuToggle.addEventListener("click", () => {
  navMenu.classList.toggle("open");
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("open");
  });
});

/* FAQ accordion */
faqItems.forEach((item) => {
  const button = item.querySelector(".faq-question");

  button.addEventListener("click", () => {
    faqItems.forEach((faq) => {
      if (faq !== item) faq.classList.remove("active");
    });

    item.classList.toggle("active");
  });
});

/* Reservation form validation */
reservationForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(reservationForm);
  const name = formData.get("name").trim();
  const phone = formData.get("phone").trim();
  const email = formData.get("email").trim();
  const date = formData.get("date");
  const time = formData.get("time");
  const guests = formData.get("guests");

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[0-9+\-\s()]{7,}$/;

  if (!name || !phone || !email || !date || !time || !guests) {
    showFormMessage("Please complete all required fields.", "error");
    return;
  }

  if (!phonePattern.test(phone)) {
    showFormMessage("Please enter a valid phone number.", "error");
    return;
  }

  if (!emailPattern.test(email)) {
    showFormMessage("Please enter a valid email address.", "error");
    return;
  }

  if (Number(guests) < 1) {
    showFormMessage("Please enter at least 1 guest.", "error");
    return;
  }

  showFormMessage("Thank you. Your reservation request is ready to be sent to BOCA.", "success");
  reservationForm.reset();
});

function showFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
}

/* Scroll reveal animation */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

revealElements.forEach((element) => revealObserver.observe(element));

/* Active navigation highlight and back-to-top */
window.addEventListener("scroll", () => {
  let currentSection = "";

  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 120;

    if (window.scrollY >= sectionTop) {
      currentSection = section.getAttribute("id");
    }
  });

  navLinks.forEach((link) => {
    link.classList.remove("active");

    if (link.getAttribute("href") === `#${currentSection}`) {
      link.classList.add("active");
    }
  });

  if (window.scrollY > 500) {
    backToTop.classList.add("show");
  } else {
    backToTop.classList.remove("show");
  }
});

/* Back to top */
backToTop.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});