// Prevent layout shift and scroll jump when SweetAlert2 opens

// Calculate scrollbar width
function getScrollbarWidth() {
  const outer = document.createElement("div");
  outer.style.visibility = "hidden";
  outer.style.overflow = "scroll";
  outer.style.msOverflowStyle = "scrollbar";
  document.body.appendChild(outer);

  const inner = document.createElement("div");
  outer.appendChild(inner);

  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
}

// Store the scrollbar width as a CSS variable
const scrollbarWidth = getScrollbarWidth();
document.documentElement.style.setProperty(
  "--scrollbar-width",
  `${scrollbarWidth}px`,
);

function disableDragInteractions(root = document) {
  if (!root) {
    return;
  }

  const elements = root.querySelectorAll("a, button, a img");
  elements.forEach((element) => {
    element.setAttribute("draggable", "false");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    disableDragInteractions();
  });
} else {
  disableDragInteractions();
}

document.addEventListener("dragstart", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (
    target.matches("a") ||
    target.matches("button") ||
    (target.matches("img") && target.closest("a"))
  ) {
    event.preventDefault();
  }
});

// Store scroll positions
let savedScrollPositions = new Map();

// Override SweetAlert2's default behavior
const originalSwalFire = Swal.fire;
Swal.fire = function (...args) {
  // Get the body's current state
  const bodyHasScrollbar = document.body.scrollHeight > window.innerHeight;

  // Save scroll positions of all scrollable elements
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");
  const filter = document.querySelector(".filter");
  const content = document.querySelector(".content");

  if (sidebar) {
    savedScrollPositions.set("sidebar", sidebar.scrollTop);
  }
  if (main) {
    savedScrollPositions.set("main", main.scrollTop);
  }
  if (filter) {
    savedScrollPositions.set("filter", filter.scrollTop);
  }
  if (content) {
    savedScrollPositions.set("content", content.scrollTop);
  }

  // Call original Swal.fire
  const result = originalSwalFire.apply(this, args);

  // After modal opens, restore scroll positions and add padding
  setTimeout(() => {
    if (sidebar) {
      sidebar.scrollTop = savedScrollPositions.get("sidebar") || 0;
      if (bodyHasScrollbar) {
        sidebar.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    if (main) {
      main.scrollTop = savedScrollPositions.get("main") || 0;
      if (bodyHasScrollbar) {
        main.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    if (filter) {
      filter.scrollTop = savedScrollPositions.get("filter") || 0;
    }
    if (content) {
      content.scrollTop = savedScrollPositions.get("content") || 0;
    }
  }, 0);

  // When SweetAlert closes, remove the padding and restore scroll positions
  const cleanup = () => {
    if (sidebar) {
      sidebar.style.paddingRight = "";
      sidebar.scrollTop = savedScrollPositions.get("sidebar") || 0;
    }
    if (main) {
      main.style.paddingRight = "";
      main.scrollTop = savedScrollPositions.get("main") || 0;
    }
    if (filter) {
      filter.scrollTop = savedScrollPositions.get("filter") || 0;
    }
    if (content) {
      content.scrollTop = savedScrollPositions.get("content") || 0;
    }
    savedScrollPositions.clear();
  };

  result.then(cleanup).catch(cleanup);

  return result;
};
