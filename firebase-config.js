const firebaseConfig = {
  apiKey: "AIzaSyAeQmIo2EEQNSvuBt54obS-qrRxn35WaT8",
  authDomain: "operating-system-ea358.firebaseapp.com",
  projectId: "operating-system-ea358",
  storageBucket: "operating-system-ea358.firebasestorage.app",
  messagingSenderId: "896027329219",
  appId: "1:896027329219:web:59d7ef893c8ee61c10d876",
  measurementId: "G-8KRMJJF1C8"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth ? firebase.auth() : null;
const db = firebase.firestore();
