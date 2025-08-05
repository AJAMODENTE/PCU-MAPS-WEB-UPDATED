// Add this JavaScript code to handle the mobile menu toggle

document.addEventListener('DOMContentLoaded', function() {
  // Create mobile menu toggle button
  const mobileMenuToggle = document.createElement('button');
  mobileMenuToggle.className = 'mobile-menu-toggle';
  mobileMenuToggle.innerHTML = '<span></span>';
  document.body.appendChild(mobileMenuToggle);
  
  // Create overlay for mobile menu
  const menuOverlay = document.createElement('div');
  menuOverlay.className = 'menu-overlay';
  document.body.appendChild(menuOverlay);
  
  const sidebar = document.querySelector('.sidebar');
  
  // Toggle menu when button is clicked
  mobileMenuToggle.addEventListener('click', function() {
    this.classList.toggle('open');
    sidebar.classList.toggle('open');
    menuOverlay.classList.toggle('active');
    
    // Prevent body scrolling when menu is open
    if (sidebar.classList.contains('open')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  });
  
  // Close menu when clicking on overlay
  menuOverlay.addEventListener('click', function() {
    mobileMenuToggle.classList.remove('open');
    sidebar.classList.remove('open');
    this.classList.remove('active');
    document.body.style.overflow = '';
  });
  
  // Close menu when clicking on a menu item
  const menuItems = document.querySelectorAll('.sidebar .nav-item');
  menuItems.forEach(item => {
    item.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        mobileMenuToggle.classList.remove('open');
        sidebar.classList.remove('open');
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });
  
  // Handle resize events
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      mobileMenuToggle.classList.remove('open');
      sidebar.classList.remove('open');
      menuOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});