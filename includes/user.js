
  // Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCq8eXVoQtt_l9EFkIhYxzoUvW7HOIvZzk",
  authDomain: "pcu-maps-5d985.firebaseapp.com",
  databaseURL: "https://pcu-maps-5d985-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcu-maps-5d985",
  storageBucket: "pcu-maps-5d985.firebasestorage.app",
  messagingSenderId: "922913954447",
  appId: "1:922913954447:web:c9f2db5e796c56fb7b2efa"
};

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);

  // Get user email and insert it
  firebase.auth().onAuthStateChanged(function(user) {
 const sidebarUser = document.getElementById("sidebarUser");
    if (user && sidebarUser) {
      sidebarUser.textContent = user.email || "User";
    }
  });

