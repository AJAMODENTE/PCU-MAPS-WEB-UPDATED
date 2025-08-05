// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// Your web app's Firebase configuration
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

submit.addEventListener("click", function (event) {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      Swal.fire({
        title: 'Login Successful!',
        icon: 'success',
        showConfirmButton: false,
        timer: 1500
      }).then(() => {
        window.location.href = "/pages/manage_events.html";
      });
    })
    .catch((error) => {
      const errorMessage = error.message;
      Swal.fire({
        title: 'Login Failed',
        text: errorMessage,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    });
});



