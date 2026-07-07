// Mobile menu
const menuToggle = document.getElementById("menuToggle");
const navMenu = document.getElementById("navMenu");
const navLinks = document.querySelectorAll(".nav-link");

menuToggle.addEventListener("click", () => {
  navMenu.classList.toggle("open");
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("open");
  });
});

// FAQ accordion
const faqItems = document.querySelectorAll(".faq-item");

faqItems.forEach((item) => {
  const question = item.querySelector(".faq-question");

  question.addEventListener("click", () => {
    faqItems.forEach((otherItem) => {
      if (otherItem !== item) {
        otherItem.classList.remove("open");
      }
    });

    item.classList.toggle("open");
  });
});

// Contact form validation
const contactForm = document.getElementById("contactForm");
const formMessage = document.getElementById("formMessage");

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(contactForm);
  const name = formData.get("name").trim();
  const phone = formData.get("phone").trim();
  const email = formData.get("email").trim();
  const need = formData.get("need").trim();
  const budget = formData.get("budget");
  const method = formData.get("method");
  const message = formData.get("message").trim();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[0-9+\-\s()]{7,20}$/;

  if (!name || !phone || !email || !need || !budget || !method || !message) {
    showFormMessage("Please complete all fields before sending your inquiry.", "error");
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

  showFormMessage(
    "Thank you. Your inquiry is ready. Please connect this form to your preferred email or backend service.",
    "success"
  );

  contactForm.reset();
});

function showFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
}

// Scroll reveal animations
const revealElements = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  {
    threshold: 0.15
  }
);

revealElements.forEach((element) => revealObserver.observe(element));

// Active navigation highlight on scroll
const sections = document.querySelectorAll("main section[id]");

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const currentId = entry.target.getAttribute("id");

        navLinks.forEach((link) => {
          link.classList.remove("active");

          if (link.getAttribute("href") === `#${currentId}`) {
            link.classList.add("active");
          }
        });
      }
    });
  },
  {
    rootMargin: "-40% 0px -55% 0px"
  }
);

sections.forEach((section) => sectionObserver.observe(section));

// Back-to-top button
const backToTop = document.getElementById("backToTop");

window.addEventListener("scroll", () => {
  if (window.scrollY > 600) {
    backToTop.classList.add("show");
  } else {
    backToTop.classList.remove("show");
  }
});

backToTop.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

// Dynamic copyright year
document.getElementById("year").textContent = new Date().getFullYear();